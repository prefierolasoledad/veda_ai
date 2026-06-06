import { Assignment, Question } from "../store/assignmentStore";
import { authService } from "./authService";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

/**
 * Custom fetch wrapper that automatically handles credentials and silent token refresh on 401.
 */
async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  options.credentials = "include";
  let response = await fetch(url, options);

  if (response.status === 401) {
    const refreshResult = await authService.refresh();
    if (refreshResult.success) {
      response = await fetch(url, options);
    } else {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("unauthorized"));
      }
    }
  }
  return response;
}

export const api = {
  /**
   * Generates a question paper based on the current assignment config
   */
  async generateAssignment(config: any): Promise<ApiResponse<any>> {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/assignments/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error: any) {
      console.error("API generateAssignment error:", error);
      return {
        success: false,
        error: error.message || "Failed to generate assignment. Please try again.",
      };
    }
  },

  /**
   * Fetches an existing assignment by ID
   */
  async getAssignmentById(id: string): Promise<ApiResponse<Assignment>> {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/assignments/${id}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error: any) {
      console.error("API getAssignmentById error:", error);
      return {
        success: false,
        error: error.message || `Failed to fetch assignment with ID: ${id}`,
      };
    }
  },

  /**
   * Uploads material files for assessment generation context
   */
  async uploadReferenceMaterial(file: File): Promise<ApiResponse<{ fileUrl: string; token: string }>> {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await authenticatedFetch(`${API_BASE_URL}/materials/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error: any) {
      console.error("API uploadReferenceMaterial error:", error);
      return {
        success: false,
        error: error.message || "Failed to upload reference material.",
      };
    }
  },

  /**
   * Fetches all assignments for the logged-in user
   */
  async listAssignments(): Promise<ApiResponse<any[]>> {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/assignments`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const resData = await response.json();
      return { success: true, data: resData.data };
    } catch (error: any) {
      console.error("API listAssignments error:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch assignments.",
      };
    }
  },

  /**
   * Deletes an assignment by ID
   */
  async deleteAssignment(id: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/assignments/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const resData = await response.json();
      return { success: true, data: resData };
    } catch (error: any) {
      console.error("API deleteAssignment error:", error);
      return {
        success: false,
        error: error.message || "Failed to delete assignment.",
      };
    }
  },
};
