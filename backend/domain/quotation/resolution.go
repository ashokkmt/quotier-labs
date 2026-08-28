package quotation

import (
	"context"
	"encoding/json"
	"fmt"

	"quotierlabs/backend/domain"
	domain_section "quotierlabs/backend/domain/section"
	domain_template "quotierlabs/backend/domain/template"
)

type TemplateResolver struct {
	sectionRepo domain.SectionDefinitionRepository
}

func NewTemplateResolver(sectionRepo domain.SectionDefinitionRepository) *TemplateResolver {
	return &TemplateResolver{sectionRepo: sectionRepo}
}

func (r *TemplateResolver) Resolve(ctx context.Context, template *domain.Template) (*Document, error) {
	if template.Layout == "" {
		return &Document{SchemaVersion: 1, Children: []Block{}}, nil
	}

	layout, err := domain_template.ParseLayout(template.Layout)
	if err != nil {
		return nil, fmt.Errorf("failed to parse template layout: %w", err)
	}
	if len(layout.Children) > 0 {
		// Recursive layouts already contain their structured content. Definitions
		// are resolved at authoring time; clone the tree so quotation edits cannot
		// mutate the template value held by the repository.
		b, err := json.Marshal(layout.Children)
		if err != nil {
			return nil, err
		}
		var children []Block
		if err := json.Unmarshal(b, &children); err != nil {
			return nil, err
		}
		return &Document{SchemaVersion: 1, Children: children}, nil
	}

	doc := &Document{Rows: make([]Row, len(layout.Rows))}

	for i, tRow := range layout.Rows {
		doc.Rows[i] = Row{
			ID:      tRow.ID,
			Order:   tRow.Order,
			Columns: make([]Column, len(tRow.Columns)),
		}
		for j, tCol := range tRow.Columns {
			doc.Rows[i].Columns[j] = Column{
				ID:       tCol.ID,
				Order:    tCol.Order,
				Width:    string(tCol.Width),
				Sections: make([]Section, 0, len(tCol.Sections)),
			}
			for _, tSec := range tCol.Sections {
				// Fetch section definition
				def, err := r.sectionRepo.GetByID(ctx, tSec.SectionDefinitionID)
				if err != nil {
					// For resilience, skip missing sections instead of failing entire resolution
					continue
				}

				secSchema, err := domain_section.ParseSchema(def.Schema)
				if err != nil {
					continue
				}

				docSec := Section{
					ID:                  tSec.ID,
					SectionDefinitionID: tSec.SectionDefinitionID,
					Title:               def.Name,
					Visibility:          tSec.Visibility,
					Optional:            tSec.Optional,
					Fields:              []FieldValue{},
					Tables:              []TableDefinition{},
				}

				if tSec.TitleOverride != nil {
					docSec.Title = *tSec.TitleOverride
				}

				// Resolve schema elements
				for _, el := range secSchema.Elements {
					if el.Type == domain_section.ElementField && el.Field != nil {
						f := FieldValue{
							ID:       el.Field.ID,
							Label:    el.Field.Label,
							Type:     string(el.Field.Type),
							Required: el.Field.Required,
							Config:   el.Field.Config,
							Value:    el.Field.DefaultValue,
						}
						if tSec.FieldOverrides != nil {
							if val, ok := tSec.FieldOverrides[f.ID]; ok {
								f.Value = val
							}
						}
						docSec.Fields = append(docSec.Fields, f)
					} else if el.Type == domain_section.ElementTable && el.Table != nil {
						tbl := TableDefinition{
							ID:           el.Table.ID,
							Name:         el.Table.Name,
							HasTotals:    el.Table.HasTotals,
							TotalsConfig: el.Table.TotalsConfig,
							Columns:      make([]TableColumn, len(el.Table.Columns)),
							Rows:         []map[string]interface{}{},
						}
						for k, tCol := range el.Table.Columns {
							tbl.Columns[k] = TableColumn{
								ID:      tCol.ID,
								Label:   tCol.Label,
								Type:    string(tCol.Type),
								Formula: tCol.Formula,
								Width:   tCol.Width,
							}
						}
						// If layout overrides contain rows, inject them
						if tSec.LayoutOverrides != nil {
							if rowsData, ok := tSec.LayoutOverrides[tbl.ID]; ok {
								if b, err := json.Marshal(rowsData); err == nil {
									var parsedRows []map[string]interface{}
									json.Unmarshal(b, &parsedRows)
									tbl.Rows = parsedRows
								}
							}
						}
						docSec.Tables = append(docSec.Tables, tbl)
					}
				}

				doc.Rows[i].Columns[j].Sections = append(doc.Rows[i].Columns[j].Sections, docSec)
			}
		}
	}

	return doc, nil
}
