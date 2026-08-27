export namespace company {
	
	export class CompanyCreateDTO {
	    name: string;
	    legal_name?: string;
	    tax_id?: string;
	    address?: string;
	    phone?: string;
	    email?: string;
	    website?: string;
	    logo_url?: string;
	    state?: string;
	    gstin?: string;
	    pan?: string;
	    bank_details?: string;
	    signature_url?: string;
	    stamp_url?: string;
	    currency: string;
	
	    static createFrom(source: any = {}) {
	        return new CompanyCreateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.legal_name = source["legal_name"];
	        this.tax_id = source["tax_id"];
	        this.address = source["address"];
	        this.phone = source["phone"];
	        this.email = source["email"];
	        this.website = source["website"];
	        this.logo_url = source["logo_url"];
	        this.state = source["state"];
	        this.gstin = source["gstin"];
	        this.pan = source["pan"];
	        this.bank_details = source["bank_details"];
	        this.signature_url = source["signature_url"];
	        this.stamp_url = source["stamp_url"];
	        this.currency = source["currency"];
	    }
	}
	export class CompanyDTO {
	    id: string;
	    name: string;
	    legal_name?: string;
	    tax_id?: string;
	    address?: string;
	    phone?: string;
	    email?: string;
	    website?: string;
	    logo_url?: string;
	    state?: string;
	    gstin?: string;
	    pan?: string;
	    bank_details?: string;
	    signature_url?: string;
	    stamp_url?: string;
	    currency: string;
	    is_active: boolean;
	
	    static createFrom(source: any = {}) {
	        return new CompanyDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.legal_name = source["legal_name"];
	        this.tax_id = source["tax_id"];
	        this.address = source["address"];
	        this.phone = source["phone"];
	        this.email = source["email"];
	        this.website = source["website"];
	        this.logo_url = source["logo_url"];
	        this.state = source["state"];
	        this.gstin = source["gstin"];
	        this.pan = source["pan"];
	        this.bank_details = source["bank_details"];
	        this.signature_url = source["signature_url"];
	        this.stamp_url = source["stamp_url"];
	        this.currency = source["currency"];
	        this.is_active = source["is_active"];
	    }
	}
	export class CompanyUpdateDTO {
	    id: string;
	    name: string;
	    legal_name?: string;
	    tax_id?: string;
	    address?: string;
	    phone?: string;
	    email?: string;
	    website?: string;
	    logo_url?: string;
	    state?: string;
	    gstin?: string;
	    pan?: string;
	    bank_details?: string;
	    signature_url?: string;
	    stamp_url?: string;
	    currency: string;
	
	    static createFrom(source: any = {}) {
	        return new CompanyUpdateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.legal_name = source["legal_name"];
	        this.tax_id = source["tax_id"];
	        this.address = source["address"];
	        this.phone = source["phone"];
	        this.email = source["email"];
	        this.website = source["website"];
	        this.logo_url = source["logo_url"];
	        this.state = source["state"];
	        this.gstin = source["gstin"];
	        this.pan = source["pan"];
	        this.bank_details = source["bank_details"];
	        this.signature_url = source["signature_url"];
	        this.stamp_url = source["stamp_url"];
	        this.currency = source["currency"];
	    }
	}

}

export namespace customer {
	
	export class CustomerCreateDTO {
	    name: string;
	    company_name?: string;
	    contact_person?: string;
	    address?: string;
	    phone?: string;
	    email?: string;
	    gstin?: string;
	    pan?: string;
	    state?: string;
	    country?: string;
	    billing_address?: string;
	    shipping_address?: string;
	    notes?: string;
	
	    static createFrom(source: any = {}) {
	        return new CustomerCreateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.company_name = source["company_name"];
	        this.contact_person = source["contact_person"];
	        this.address = source["address"];
	        this.phone = source["phone"];
	        this.email = source["email"];
	        this.gstin = source["gstin"];
	        this.pan = source["pan"];
	        this.state = source["state"];
	        this.country = source["country"];
	        this.billing_address = source["billing_address"];
	        this.shipping_address = source["shipping_address"];
	        this.notes = source["notes"];
	    }
	}
	export class CustomerDTO {
	    id: string;
	    name: string;
	    company_name?: string;
	    contact_person?: string;
	    address?: string;
	    phone?: string;
	    email?: string;
	    gstin?: string;
	    pan?: string;
	    state?: string;
	    country?: string;
	    billing_address?: string;
	    shipping_address?: string;
	    notes?: string;
	
	    static createFrom(source: any = {}) {
	        return new CustomerDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.company_name = source["company_name"];
	        this.contact_person = source["contact_person"];
	        this.address = source["address"];
	        this.phone = source["phone"];
	        this.email = source["email"];
	        this.gstin = source["gstin"];
	        this.pan = source["pan"];
	        this.state = source["state"];
	        this.country = source["country"];
	        this.billing_address = source["billing_address"];
	        this.shipping_address = source["shipping_address"];
	        this.notes = source["notes"];
	    }
	}
	export class CustomerListDTO {
	    items: CustomerDTO[];
	    total: number;
	
	    static createFrom(source: any = {}) {
	        return new CustomerListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], CustomerDTO);
	        this.total = source["total"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CustomerListFilterDTO {
	    limit: number;
	    offset: number;
	
	    static createFrom(source: any = {}) {
	        return new CustomerListFilterDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.limit = source["limit"];
	        this.offset = source["offset"];
	    }
	}
	export class CustomerUpdateDTO {
	    id: string;
	    name: string;
	    company_name?: string;
	    contact_person?: string;
	    address?: string;
	    phone?: string;
	    email?: string;
	    gstin?: string;
	    pan?: string;
	    state?: string;
	    country?: string;
	    billing_address?: string;
	    shipping_address?: string;
	    notes?: string;
	
	    static createFrom(source: any = {}) {
	        return new CustomerUpdateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.company_name = source["company_name"];
	        this.contact_person = source["contact_person"];
	        this.address = source["address"];
	        this.phone = source["phone"];
	        this.email = source["email"];
	        this.gstin = source["gstin"];
	        this.pan = source["pan"];
	        this.state = source["state"];
	        this.country = source["country"];
	        this.billing_address = source["billing_address"];
	        this.shipping_address = source["shipping_address"];
	        this.notes = source["notes"];
	    }
	}

}

export namespace quotation {
	
	export class CalculationResultDTO {
	    subtotal: number;
	    discount_total: number;
	    taxable_total: number;
	    cgst_total: number;
	    sgst_total: number;
	    igst_total: number;
	    grand_total: number;
	    tax_mode: string;
	
	    static createFrom(source: any = {}) {
	        return new CalculationResultDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.subtotal = source["subtotal"];
	        this.discount_total = source["discount_total"];
	        this.taxable_total = source["taxable_total"];
	        this.cgst_total = source["cgst_total"];
	        this.sgst_total = source["sgst_total"];
	        this.igst_total = source["igst_total"];
	        this.grand_total = source["grand_total"];
	        this.tax_mode = source["tax_mode"];
	    }
	}
	export class QuotationCreateDTO {
	    template_id: string;
	    customer_id: string;
	
	    static createFrom(source: any = {}) {
	        return new QuotationCreateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.template_id = source["template_id"];
	        this.customer_id = source["customer_id"];
	    }
	}
	export class QuotationDTO {
	    id: string;
	    company_id: string;
	    template_id: string;
	    customer_id: string;
	    number: string;
	    status: string;
	    document: string;
	    subtotal: number;
	    discount_total: number;
	    taxable_total: number;
	    cgst_total: number;
	    sgst_total: number;
	    igst_total: number;
	    grand_total: number;
	    // Go type: time
	    valid_until?: any;
	    notes?: string;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new QuotationDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.company_id = source["company_id"];
	        this.template_id = source["template_id"];
	        this.customer_id = source["customer_id"];
	        this.number = source["number"];
	        this.status = source["status"];
	        this.document = source["document"];
	        this.subtotal = source["subtotal"];
	        this.discount_total = source["discount_total"];
	        this.taxable_total = source["taxable_total"];
	        this.cgst_total = source["cgst_total"];
	        this.sgst_total = source["sgst_total"];
	        this.igst_total = source["igst_total"];
	        this.grand_total = source["grand_total"];
	        this.valid_until = this.convertValues(source["valid_until"], null);
	        this.notes = source["notes"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class QuotationUpdateCustomerDTO {
	    id: string;
	    customer_id: string;
	
	    static createFrom(source: any = {}) {
	        return new QuotationUpdateCustomerDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.customer_id = source["customer_id"];
	    }
	}
	export class QuotationUpdateDocumentDTO {
	    id: string;
	    document: string;
	
	    static createFrom(source: any = {}) {
	        return new QuotationUpdateDocumentDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.document = source["document"];
	    }
	}

}

export namespace section {
	
	export class SectionCreateDTO {
	    name: string;
	    description?: string;
	    category?: string;
	    schema: string;
	
	    static createFrom(source: any = {}) {
	        return new SectionCreateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.category = source["category"];
	        this.schema = source["schema"];
	    }
	}
	export class SectionDefinitionDTO {
	    id: string;
	    company_id?: string;
	    name: string;
	    description?: string;
	    schema: string;
	    schema_version: number;
	    is_builtin: boolean;
	    category?: string;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new SectionDefinitionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.company_id = source["company_id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.schema = source["schema"];
	        this.schema_version = source["schema_version"];
	        this.is_builtin = source["is_builtin"];
	        this.category = source["category"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SectionUpdateDTO {
	    id: string;
	    name: string;
	    description?: string;
	    category?: string;
	    schema: string;
	
	    static createFrom(source: any = {}) {
	        return new SectionUpdateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.category = source["category"];
	        this.schema = source["schema"];
	    }
	}

}

export namespace template {
	
	export class TemplateCreateDTO {
	    name: string;
	    description?: string;
	    layout: string;
	
	    static createFrom(source: any = {}) {
	        return new TemplateCreateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.layout = source["layout"];
	    }
	}
	export class TemplateDTO {
	    id: string;
	    company_id?: string;
	    name: string;
	    description?: string;
	    layout: string;
	    schema_version: number;
	    is_builtin: boolean;
	    current_version: number;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new TemplateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.company_id = source["company_id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.layout = source["layout"];
	        this.schema_version = source["schema_version"];
	        this.is_builtin = source["is_builtin"];
	        this.current_version = source["current_version"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TemplateUpdateDTO {
	    id: string;
	    name: string;
	    description?: string;
	    layout: string;
	
	    static createFrom(source: any = {}) {
	        return new TemplateUpdateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.layout = source["layout"];
	    }
	}

}

