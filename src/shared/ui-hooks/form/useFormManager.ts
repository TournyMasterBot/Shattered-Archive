import FormManager from "@shared/types/ui-types/form-interface";
import { useState, useEffect } from "react";

/**
 * Custom hook that manages CSRF token retrieval and form submission.
 */
export const useFormManager = (csrfEndpoint: string = "/web-server/security/get-csrf-token"): FormManager => {
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Function to fetch a new CSRF token
  const refreshToken = async (): Promise<string> => {
    try {
      console.log("Fetching CSRF token");
      const res = await fetch(csrfEndpoint, {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch CSRF token");
      }
      const data = await res.json();
      if (!data.token) {
        throw new Error("Failed to set CSRF token");
      }
      setCsrfToken(data.token);
      return data.token;
    } catch (err: any) {
      setError(err.message || "Error fetching CSRF token");
      throw err;
    }
  };

  /**
   * Submit a form (POST) to a given URL with a provided payload.
   * If the CSRF token is invalid (403), it fetches a new token and retries.
   */
  const submitForm = async <T = any>(url: string, method: string, payload?: any): Promise<T> => {
    setLoading(true);
    setError("");
  
    const makeRequest = async (token: string) => {
      const upperMethod = method.toUpperCase();
    
      // Build the common options
      const options: RequestInit = {
        method: upperMethod,
        headers: {
          "x-csrf-token": token,
          "Content-Type": "application/json",
        },
        credentials: "include",
      };
    
      // Only add a body for methods that support one
      if (upperMethod !== "GET" && upperMethod !== "HEAD") {
        options.body = JSON.stringify(payload);
      }
    
      return fetch(url, options);
    };
  
    try {
      let response = await makeRequest(csrfToken);  
      if (!response.ok) {
        let errorMsg = `Request failed with status ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.errors) {
            console.log("Request Errors", {
              errors: errorData.errors
            });
            if (response.status === 400) {
              errorMsg = "Invalid form data, please check that all required fields are populated";
            } else if (response.status === 403) {
              errorMsg = "Request Forbidden"
            } else if (response.status === 401) {
              errorMsg = "Request Unauthorized"
            } else if (response.status === 429) {
              errorMsg = "Request Rate Limited"
            } else if (response.status === 500) {
              errorMsg = "Internal Server Error"
            } else {
              errorMsg = errorData.errors
                .map((err: any) => err.message || JSON.stringify(err))
                .join(" | ");
            }
          } else if (errorData.message) {
            errorMsg = errorData.message;
          }
        } catch (parseError) {
          console.log("Unknown error : Parse error", {
            parseError: parseError
          });
          errorMsg = "Unknown error : Parse error";
        }
        setError(errorMsg);
        throw new Error(errorMsg);
      }
  
      const result = (await response.json());
      setLoading(false);
      return result;
    } catch (err: any) {
      console.log("Submission error:", {
        err: err
      });
      setLoading(false);
      setError(err ?? ["An unknown error occurred"]);
      throw err;
    }
  };  

  return { csrfToken, loading, error, submitForm, refreshToken };
};
