import { Coordinate } from './trip';

export interface POISearchRequest {
  keyword: string;
  city?: string;
  type?: string;
  lat?: number;
  lng?: number;
  radius?: number;
}

export interface POISearchResult {
  pois: POISuggestion[];
  count: number;
}

export interface POISuggestion {
  amapId: string;
  name: string;
  address: string;
  coordinate: Coordinate;
  category: string;
  type: string;
}

export interface MapLayerState {
  markers: boolean;
  routes: boolean;
}
