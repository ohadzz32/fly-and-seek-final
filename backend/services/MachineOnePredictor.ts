import { spawn } from 'child_process';
import path from 'path';
import { IPredictionProvider } from '../interfaces/IPredictionProvider';
import { logger } from '../utils/logger';

export class MachineOnePredictor implements IPredictionProvider {
    private readonly scriptPath: string;
    private readonly pythonPath: string;

    constructor() {
        // Adjust these paths as necessary for the environment
        this.scriptPath = path.resolve(__dirname, '../../ml/ml_project_first_machine_final/predict_flight.py');
        // Assuming python is in the PATH or use a specific venv path if needed
        this.pythonPath = process.env.PYTHON_PATH || 'python';
    }

    public async predict(history: any[]): Promise<any> {
        return new Promise((resolve, reject) => {
            logger.info(`[MachineOnePredictor] Starting ML prediction. History length: ${history.length}`);
            logger.info(`[MachineOnePredictor] Script path: ${this.scriptPath}`);
            logger.info(`[MachineOnePredictor] Python path: ${this.pythonPath}`);
            
            const pythonProcess = spawn(this.pythonPath, [this.scriptPath]);
            
            let outputData = '';
            let errorData = '';

            // Handle output
            pythonProcess.stdout.on('data', (data) => {
                const chunk = data.toString();
                outputData += chunk;
                logger.info(`[MachineOnePredictor] stdout chunk: ${chunk}`);
            });

            // Handle errors
            pythonProcess.stderr.on('data', (data) => {
                const chunk = data.toString();
                errorData += chunk;
                logger.error(`[MachineOnePredictor] stderr: ${chunk}`);
            });

            pythonProcess.on('error', (err) => {
                logger.error(`[MachineOnePredictor] Process spawn error: ${err.message}`);
                reject(err);
            });

            pythonProcess.on('close', (code) => {
                logger.info(`[MachineOnePredictor] Python process closed with code ${code}`);
                
                if (code !== 0) {
                    logger.error(`[MachineOnePredictor] Prediction failed. Exit code: ${code}. Full stderr: ${errorData}`);
                    return reject(new Error(`Prediction process failed with code ${code}: ${errorData}`));
                }

                try {
                    const result = JSON.parse(outputData);
                    if (result.error) {
                        logger.error(`[MachineOnePredictor] ML Model returned error JSON: ${result.error}`);
                        if (result.traceback) {
                            logger.error(`[MachineOnePredictor] ML Model Traceback: ${result.traceback}`);
                        }
                        return reject(new Error(result.error));
                    }
                    logger.info(`[MachineOnePredictor] ✅ Prediction successful: ${JSON.stringify(result)}`);
                    resolve(result);
                } catch (e) {
                    logger.error(`[MachineOnePredictor] Failed to parse ML output as JSON. Output was: ${outputData}`);
                    reject(new Error('Invalid output from ML model'));
                }
            });

            // Feed the history to stdin
            try {
                const inputJson = JSON.stringify(history);
                logger.info(`[MachineOnePredictor] Writing ${inputJson.length} bytes to stdin`);
                pythonProcess.stdin.write(inputJson);
                pythonProcess.stdin.end();
            } catch (e) {
                logger.error(`[MachineOnePredictor] Failed to write to Python stdin: ${e}`);
                pythonProcess.kill();
                reject(e);
            }
        });
    }
}
