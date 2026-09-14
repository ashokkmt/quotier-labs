package flowlayout

import (
	"fmt"
	"math"

	"quotierlabs/backend/application/layoutir"
	"quotierlabs/backend/domain/documentv6"
)

type tableCellPlacement struct {
	row, column, colspan, rowspan int
	cell                          TableCell
}

func layoutTable(doc *documentv6.Document, node documentv6.Node, attrs documentv6.TableAttrs, maxWidth float64, input ResolveInput, metrics layoutir.Metrics, diagnostics *[]Diagnostic) ([]Block, float64) {
	columns := make([]float64, len(attrs.ColumnWidths))
	width := 0.0
	for index, value := range attrs.ColumnWidths {
		columns[index] = float64(value) / duPerMM
		width += columns[index]
	}
	if width > maxWidth {
		scale := maxWidth / width
		width = 0
		for index := range columns {
			columns[index] *= scale
			width += columns[index]
		}
	}
	padding := float64(attrs.CellPadding) / duPerMM
	if padding == 0 {
		padding = 1.5
	}
	occupied := make([][]bool, len(node.Content))
	for row := range occupied {
		occupied[row] = make([]bool, len(columns))
	}
	heights := make([]float64, len(node.Content))
	placements := make([]tableCellPlacement, 0)
	for rowIndex, rowNode := range node.Content {
		rowAttrs := decode[documentv6.TableRowAttrs](rowNode.Attrs)
		heights[rowIndex] = math.Max(8, float64(rowAttrs.MinHeight)/duPerMM)
		column := 0
		for _, cellNode := range rowNode.Content {
			for occupied[rowIndex][column] {
				column++
			}
			cellAttrs := decode[documentv6.TableCellAttrs](cellNode.Attrs)
			colspan, rowspan := intOr(cellAttrs.Colspan, 1), intOr(cellAttrs.Rowspan, 1)
			cellWidth := 0.0
			for index := column; index < column+colspan; index++ {
				cellWidth += columns[index]
			}
			cellPadding := float64(cellAttrs.Padding) / duPerMM
			if cellPadding == 0 {
				cellPadding = padding
			}
			runs := cellRuns(doc, cellNode, input, diagnostics)
			lines := wrapRuns(runs, math.Max(1, cellWidth-2*cellPadding), metrics)
			required := tableLinesHeight(lines, metrics) + 2*cellPadding
			if rowspan == 1 {
				heights[rowIndex] = math.Max(heights[rowIndex], required)
			}
			for y := rowIndex; y < rowIndex+rowspan; y++ {
				for x := column; x < column+colspan; x++ {
					occupied[y][x] = true
				}
			}
			placements = append(placements, tableCellPlacement{row: rowIndex, column: column, colspan: colspan, rowspan: rowspan, cell: TableCell{
				Lines: lines, Text: plainText(cellNode), Background: defaultString(cellAttrs.Background, "transparent"), Align: defaultString(cellAttrs.Alignment, "left"), VerticalAlign: defaultString(cellAttrs.VerticalAlignment, "top"), Column: column, Colspan: colspan, Rowspan: rowspan, Width: cellWidth, Padding: cellPadding, BorderTop: cellAttrs.BorderTop, BorderRight: cellAttrs.BorderRight, BorderBottom: cellAttrs.BorderBottom, BorderLeft: cellAttrs.BorderLeft,
			}})
			if rowspan > 1 {
				current := 0.0
				for y := rowIndex; y < rowIndex+rowspan; y++ {
					current += heights[y]
				}
				if required > current {
					heights[rowIndex+rowspan-1] += required - current
				}
			}
			column += colspan
		}
	}
	rows := make([]Block, len(node.Content))
	for rowIndex := range rows {
		rows[rowIndex] = Block{ID: fmt.Sprintf("%s-row-%d", attrs.ID, rowIndex), Kind: "tableRow", Height: heights[rowIndex], Columns: columns, BorderColor: defaultString(attrs.BorderColor, "#d1d5db"), BorderPreset: defaultString(attrs.BorderPreset, "all"), TableFirst: rowIndex == 0, TableLast: rowIndex == len(rows)-1, TableGroupEnd: rowIndex, TableRows: []TableRow{{}}}
	}
	for start := 0; start < len(rows); start++ {
		end := start
		for {
			previous := end
			for _, placement := range placements {
				if placement.row >= start && placement.row <= end && placement.row+placement.rowspan-1 > end {
					end = placement.row + placement.rowspan - 1
				}
			}
			if end == previous {
				break
			}
		}
		for row := start; row <= end; row++ {
			rows[row].TableGroupEnd = end
		}
		start = end
	}
	for _, placement := range placements {
		cell := placement.cell
		for row := placement.row; row < placement.row+placement.rowspan; row++ {
			cell.Height += heights[row]
		}
		rows[placement.row].TableRows[0].Cells = append(rows[placement.row].TableRows[0].Cells, cell)
	}
	return rows, width
}

func intOr(value, fallback int) int {
	if value == 0 {
		return fallback
	}
	return value
}
