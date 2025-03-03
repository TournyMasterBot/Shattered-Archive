interface FormManager {
  csrfToken: string;
  loading: boolean;
  error: string;
  submitForm: <T = any>(url: string, payload: any) => Promise<T>;
  refreshToken: () => Promise<string>;
}

export default FormManager;
