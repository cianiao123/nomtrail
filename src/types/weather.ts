export interface WeatherForecast {
  date: string;
  condition: string;
  tempHigh: number;
  tempLow: number;
  humidity: number;
  windSpeed: number;
  icon: string;
  precipProbability: number;
}

export interface WeatherResponse {
  location: string;
  forecasts: WeatherForecast[];
}
