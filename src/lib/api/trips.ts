import { apiClient } from "./client";
import { Trip, Activity } from "@/types/trip";
import { ApiResponse, ReorderRequest } from "@/types/api";

export const tripsApi = {
  list: () => apiClient.get<ApiResponse<Trip[]>>("/trips"),

  get: (id: string) => apiClient.get<ApiResponse<Trip>>(`/trips/${id}`),

  create: (trip: Partial<Trip>) =>
    apiClient.post<ApiResponse<Trip>>("/trips", trip),

  update: (id: string, updates: Partial<Trip>) =>
    apiClient.put<ApiResponse<Trip>>(`/trips/${id}`, updates),

  delete: (id: string) => apiClient.delete<ApiResponse<null>>(`/trips/${id}`),

  addActivity: (tripId: string, activity: Partial<Activity>) =>
    apiClient.post<ApiResponse<Activity>>(`/trips/${tripId}/activities`, activity),

  reorderActivities: (tripId: string, data: ReorderRequest) =>
    apiClient.put<ApiResponse<null>>(`/trips/${tripId}/activities`, data),
};
