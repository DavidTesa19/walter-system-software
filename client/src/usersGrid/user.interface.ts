export interface UserInterface {
  id: number;
  commission_id?: string;
  entity_internal_id?: number;
  entity_code?: string;
  name: string;
  company: string;
  location: string;
  mobile: string;
  commission?: string;
  info?: string;
  date?: string;
  status?: string;
  stage?: string;
  field?: string;
  email?: string;
  website?: string;
  address?: string;
  notes?: string;
  assigned_to?: string;
  last_contact?: string;
  next_step?: string;
  priority?: string;
  tags?: string[];
}
