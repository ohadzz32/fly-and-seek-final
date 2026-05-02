export interface IPredictionProvider {
    predict(history: any[]): Promise<any>;
}
