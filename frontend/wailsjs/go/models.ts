export namespace backup {
	
	export class AutoBackupSettings {
	    enabled: boolean;
	    directory: string;
	    last_status?: string;
	    last_backup_utc?: string;
	
	    static createFrom(source: any = {}) {
	        return new AutoBackupSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.directory = source["directory"];
	        this.last_status = source["last_status"];
	        this.last_backup_utc = source["last_backup_utc"];
	    }
	}
	export class BackupMetadata {
	    format_version: number;
	    app_version: string;
	    channel: string;
	    schema_version: number;
	    company_id: string;
	    company_name: string;
	    // Go type: time
	    created_at: any;
	    quotation_count: number;
	    customer_count: number;
	
	    static createFrom(source: any = {}) {
	        return new BackupMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.format_version = source["format_version"];
	        this.app_version = source["app_version"];
	        this.channel = source["channel"];
	        this.schema_version = source["schema_version"];
	        this.company_id = source["company_id"];
	        this.company_name = source["company_name"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.quotation_count = source["quotation_count"];
	        this.customer_count = source["customer_count"];
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
	export class BackupInfo {
	    path: string;
	    size: number;
	    metadata: BackupMetadata;
	
	    static createFrom(source: any = {}) {
	        return new BackupInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.size = source["size"];
	        this.metadata = this.convertValues(source["metadata"], BackupMetadata);
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
	
	export class ExportResult {
	    path: string;
	    success: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ExportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.success = source["success"];
	    }
	}
	export class ImportMapping {
	    name: string;
	    email: string;
	    phone: string;
	    address: string;
	    gstin: string;
	    pan: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportMapping(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.email = source["email"];
	        this.phone = source["phone"];
	        this.address = source["address"];
	        this.gstin = source["gstin"];
	        this.pan = source["pan"];
	    }
	}
	export class ImportPreviewRow {
	    index: number;
	    data: Record<string, string>;
	    is_valid: boolean;
	    errors: string[];
	
	    static createFrom(source: any = {}) {
	        return new ImportPreviewRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.data = source["data"];
	        this.is_valid = source["is_valid"];
	        this.errors = source["errors"];
	    }
	}
	export class ImportPreview {
	    headers: string[];
	    rows: ImportPreviewRow[];
	    total: number;
	    valid: number;
	
	    static createFrom(source: any = {}) {
	        return new ImportPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.headers = source["headers"];
	        this.rows = this.convertValues(source["rows"], ImportPreviewRow);
	        this.total = source["total"];
	        this.valid = source["valid"];
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
	
	export class ValidationResult {
	    is_valid: boolean;
	    error?: string;
	    info?: BackupInfo;
	
	    static createFrom(source: any = {}) {
	        return new ValidationResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.is_valid = source["is_valid"];
	        this.error = source["error"];
	        this.info = this.convertValues(source["info"], BackupInfo);
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

}

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

export namespace config {
	
	export class Preferences {
	    schema_version: number;
	    theme: string;
	    density: string;
	    automatic_updates: boolean;
	    skipped_version?: string;
	    last_update_check_utc?: string;
	    last_observed_update_version?: string;
	    update_feed_etag?: string;
	    update_feed_last_modified?: string;
	
	    static createFrom(source: any = {}) {
	        return new Preferences(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schema_version = source["schema_version"];
	        this.theme = source["theme"];
	        this.density = source["density"];
	        this.automatic_updates = source["automatic_updates"];
	        this.skipped_version = source["skipped_version"];
	        this.last_update_check_utc = source["last_update_check_utc"];
	        this.last_observed_update_version = source["last_observed_update_version"];
	        this.update_feed_etag = source["update_feed_etag"];
	        this.update_feed_last_modified = source["update_feed_last_modified"];
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

export namespace diagnostics {
	
	export class ProcessStats {
	    cpu_percent?: number;
	    rss_bytes?: number;
	    threads?: number;
	    open_files?: number;
	    read_bytes?: number;
	    write_bytes?: number;
	    descendant_count: number;
	
	    static createFrom(source: any = {}) {
	        return new ProcessStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cpu_percent = source["cpu_percent"];
	        this.rss_bytes = source["rss_bytes"];
	        this.threads = source["threads"];
	        this.open_files = source["open_files"];
	        this.read_bytes = source["read_bytes"];
	        this.write_bytes = source["write_bytes"];
	        this.descendant_count = source["descendant_count"];
	    }
	}
	export class ResourceSample {
	    schema_version: number;
	    type: string;
	    elapsed_ms: number;
	    // Go type: time
	    recorded_at_utc: any;
	    logical_cpus: number;
	    host: ProcessStats;
	    tree: ProcessStats;
	    go_live_heap_bytes: number;
	    go_heap_goal_bytes: number;
	    go_alloc_bytes: number;
	    go_alloc_rate_bps: number;
	    gc_cycles: number;
	    gc_pause_total_ns: number;
	    goroutines: number;
	
	    static createFrom(source: any = {}) {
	        return new ResourceSample(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schema_version = source["schema_version"];
	        this.type = source["type"];
	        this.elapsed_ms = source["elapsed_ms"];
	        this.recorded_at_utc = this.convertValues(source["recorded_at_utc"], null);
	        this.logical_cpus = source["logical_cpus"];
	        this.host = this.convertValues(source["host"], ProcessStats);
	        this.tree = this.convertValues(source["tree"], ProcessStats);
	        this.go_live_heap_bytes = source["go_live_heap_bytes"];
	        this.go_heap_goal_bytes = source["go_heap_goal_bytes"];
	        this.go_alloc_bytes = source["go_alloc_bytes"];
	        this.go_alloc_rate_bps = source["go_alloc_rate_bps"];
	        this.gc_cycles = source["gc_cycles"];
	        this.gc_pause_total_ns = source["gc_pause_total_ns"];
	        this.goroutines = source["goroutines"];
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
	export class Status {
	    available: boolean;
	    recording: boolean;
	    finalizing: boolean;
	    channel: string;
	    session_id?: string;
	    elapsed_ms: number;
	    latest?: ResourceSample;
	    last_operation?: string;
	    last_session_id?: string;
	    diagnostics_root?: string;
	
	    static createFrom(source: any = {}) {
	        return new Status(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.recording = source["recording"];
	        this.finalizing = source["finalizing"];
	        this.channel = source["channel"];
	        this.session_id = source["session_id"];
	        this.elapsed_ms = source["elapsed_ms"];
	        this.latest = this.convertValues(source["latest"], ResourceSample);
	        this.last_operation = source["last_operation"];
	        this.last_session_id = source["last_session_id"];
	        this.diagnostics_root = source["diagnostics_root"];
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

}

export namespace legacydata {
	
	export class Candidate {
	    path: string;
	    display_path: string;
	    modified_at: string;
	    size: number;
	    company_count: number;
	    quotation_count: number;
	
	    static createFrom(source: any = {}) {
	        return new Candidate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.display_path = source["display_path"];
	        this.modified_at = source["modified_at"];
	        this.size = source["size"];
	        this.company_count = source["company_count"];
	        this.quotation_count = source["quotation_count"];
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
	    template_id?: string;
	    customer_id?: string;
	
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
	    schema_version: number;
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
	        this.schema_version = source["schema_version"];
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
	export class QuotationListFilterDTO {
	    limit: number;
	    offset: number;
	    status?: string;
	    customer_id?: string;
	    template_id?: string;
	    search?: string;
	    start_date?: string;
	    end_date?: string;
	    sort_by?: string;
	    sort_desc: boolean;
	
	    static createFrom(source: any = {}) {
	        return new QuotationListFilterDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.limit = source["limit"];
	        this.offset = source["offset"];
	        this.status = source["status"];
	        this.customer_id = source["customer_id"];
	        this.template_id = source["template_id"];
	        this.search = source["search"];
	        this.start_date = source["start_date"];
	        this.end_date = source["end_date"];
	        this.sort_by = source["sort_by"];
	        this.sort_desc = source["sort_desc"];
	    }
	}
	export class QuotationSummaryDTO {
	    id: string;
	    number: string;
	    customer_id: string;
	    customer_name: string;
	    status: string;
	    grand_total: number;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new QuotationSummaryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.number = source["number"];
	        this.customer_id = source["customer_id"];
	        this.customer_name = source["customer_name"];
	        this.status = source["status"];
	        this.grand_total = source["grand_total"];
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
	export class QuotationListResponse {
	    items: QuotationSummaryDTO[];
	    total: number;
	
	    static createFrom(source: any = {}) {
	        return new QuotationListResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], QuotationSummaryDTO);
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
	export class SaveAsTemplateDTO {
	    quotation_id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveAsTemplateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.quotation_id = source["quotation_id"];
	        this.name = source["name"];
	    }
	}

}

export namespace recovery {
	
	export class Checkpoint {
	    schema_version: number;
	    // Go type: time
	    updated_at: any;
	    document: number[];
	
	    static createFrom(source: any = {}) {
	        return new Checkpoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schema_version = source["schema_version"];
	        this.updated_at = this.convertValues(source["updated_at"], null);
	        this.document = source["document"];
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

export namespace update {
	
	export class Candidate {
	    version: string;
	    release_url: string;
	    release_notes: string;
	    published_at: string;
	    size: number;
	    critical: boolean;
	    package: string;
	    db_schema_after: number;
	
	    static createFrom(source: any = {}) {
	        return new Candidate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.release_url = source["release_url"];
	        this.release_notes = source["release_notes"];
	        this.published_at = source["published_at"];
	        this.size = source["size"];
	        this.critical = source["critical"];
	        this.package = source["package"];
	        this.db_schema_after = source["db_schema_after"];
	    }
	}
	export class CheckResult {
	    status: string;
	    current_version: string;
	    candidate?: Candidate;
	    checked_at_utc: string;
	    message?: string;
	
	    static createFrom(source: any = {}) {
	        return new CheckResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.current_version = source["current_version"];
	        this.candidate = this.convertValues(source["candidate"], Candidate);
	        this.checked_at_utc = source["checked_at_utc"];
	        this.message = source["message"];
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

}

export namespace wails {
	
	export class AppInfo {
	    version: string;
	    name: string;
	    os: string;
	    arch: string;
	    channel: string;
	    commit: string;
	    build_time: string;
	    updates_enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AppInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.name = source["name"];
	        this.os = source["os"];
	        this.arch = source["arch"];
	        this.channel = source["channel"];
	        this.commit = source["commit"];
	        this.build_time = source["build_time"];
	        this.updates_enabled = source["updates_enabled"];
	    }
	}

}

