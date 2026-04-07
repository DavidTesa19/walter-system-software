
export interface EntityInterface {
  id: number;
  entity_id: string;
  assigned_to?: string;
  assigned_user_ids?: number[];
  company_name?: string;
  field?: string;
  location?: string;
  info?: string;
  category?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CommissionInterface {
  id: number;
  commission_id: string;
  entity_id: number;
  entity_code: string;
  status: string;
  position?: string;
  budget?: string;
  state?: string;
  assigned_to?: string;
  assigned_user_ids?: number[];
  field?: string;
  service_position?: string;
  location?: string;
  info?: string;
  category?: string;
  deadline?: string;
  priority?: string;
  phone?: string;
  commission_value?: string;
  is_tipped?: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

