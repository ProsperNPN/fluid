import{apiClient}from'@/lib/api';
export interface AdminHospital{id:string;hospital_name:string;registration_number:string|null;city:string;country:string;official_email:string|null;verification_status:string;created_at:string}
export interface AdminUser{id:string;full_name:string|null;email:string;role:string;is_active:boolean;is_superuser:boolean;created_at:string}
export interface AdminAudit{id:string;actor_user_id:string;action:string;entity_type:string;entity_id:string|null;details:Record<string,unknown>|null;created_at:string}
export async function listAdminHospitals(){return(await apiClient.get<{items:AdminHospital[];total:number}>('/api/v1/admin/hospitals')).data}
export async function listAdminUsers(role?:string){return(await apiClient.get<{items:AdminUser[];total:number}>('/api/v1/admin/users',{params:{role}})).data}
export async function listAdminAudits(){return(await apiClient.get<{items:AdminAudit[];total:number}>('/api/v1/admin/audit-logs')).data}
