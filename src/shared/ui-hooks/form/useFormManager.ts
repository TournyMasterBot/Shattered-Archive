import FormManager from "@shared/types/ui-types/form-interface";
import { useState, useEffect } from "react";

/**
 * Custom hook that manages CSRF token retrieval and form submission.
 * It automatically refreshes the token if a 403 (invalid token) is encountered.
 */
export const useFormManager = (csrfEndpoint: string = "/web-server/security/get-csrf-token"): FormManager => {
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Function to fetch a new CSRF token
  const refreshToken = async (): Promise<string> => {
    try {
      console.log("Refreshing CSRF token");
      const res = await fetch(csrfEndpoint, {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to refresh CSRF token");
      }
      const data = await res.json();
      setCsrfToken(data.token);
      return data.token;
    } catch (err: any) {
      setError(err.message || "Error fetching CSRF token");
      throw err;
    }
  };

  // Initially fetch the token when the hook is first used.
  useEffect(() => {
    refreshToken().catch(() => {
      // error is handled in refreshToken
    });
  }, [csrfEndpoint]);

  /**
   * Submit a form (POST) to a given URL with a provided payload.
   * If the CSRF token is invalid (403), it fetches a new token and retries.
   */
  const submitForm = async <T = any>(url: string, payload: any): Promise<T> => {
    setLoading(true);
    setError("");
    
    const makeRequest = async (token: string) => {
      return fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
    };
  
    try {
      let response = await makeRequest(csrfToken);
      if (response.status === 403) {
        const newToken = await refreshToken();
        response = await makeRequest(newToken);
      }
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const result = await response.json();
      setLoading(false);
      return result;
    } catch (err: any) {
      setLoading(false);
      const simplifiedError = err.message || "Submission error";
      setError(simplifiedError);
      console.log("Submission error:", simplifiedError);
      return Promise.reject(new Error(simplifiedError));
    }
  };

  return { csrfToken, loading, error, submitForm, refreshToken };
};
