export interface UserInterface {
  id: number;
  name: string;
  company: string;
  country: {
    name: string;
    flag: string;
  };
  mobile: string;
}
