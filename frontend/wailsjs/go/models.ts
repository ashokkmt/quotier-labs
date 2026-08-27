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

