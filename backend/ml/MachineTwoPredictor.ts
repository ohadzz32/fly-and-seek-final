import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';

export class MachineTwoPredictor {
    private readonly scriptPath: string;
    private readonly pythonPath: string;
    private readonly outputPath: string;

    constructor() {
        this.scriptPath = path.resolve(__dirname, '../../ml/Second machine identifies areas without coverage/machine2_spatial_risk_analyzer.py');
        this.pythonPath = process.env.PYTHON_PATH || 'python';
        this.outputPath = path.resolve(__dirname, 'risk_map_output.json');
    }

    public async predict(flights: any[]): Promise<any[]> {
        return new Promise((resolve, reject) => {
            logger.info(`[MachineTwoPredictor] Starting ML prediction for risk map. Processing ${flights.length} flight records.`);
            
            const pythonProcess = spawn(this.pythonPath, [
                this.scriptPath,
                '--output',
                this.outputPath
            ]);
            
            let outputData = '';
            let errorData = '';

            pythonProcess.stdout.on('data', (data) => {
                outputData += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorData += data.toString();
            });

            pythonProcess.on('error', (err) => {
                logger.error(`[MachineTwoPredictor] Process spawn error: ${err.message}`);
                reject(err);
            });

            pythonProcess.on('close', async (code) => {
                logger.info(`[MachineTwoPredictor] Python process closed with code ${code}`);
                
                if (code !== 0) {
                    logger.error(`[MachineTwoPredictor] Prediction failed. Exit code: ${code}. Full stderr: ${errorData}`);
                    return reject(new Error(`Prediction process failed with code ${code}: ${errorData}`));
                }

                try {
                    try {
                        await fs.access(this.outputPath);
                    } catch (accessErr) {
                        logger.error(`[MachineTwoPredictor] Output JSON file not found at ${this.outputPath}`);
                        return reject(new Error('ML script completed but did not produce an output file.'));
                    }

                    const fileContent = await fs.readFile(this.outputPath, 'utf-8');
                    const result = JSON.parse(fileContent);
                    logger.info(`[MachineTwoPredictor] ✅ Prediction successful`);
                    resolve(result);
                } catch (e) {
                    logger.error(`[MachineTwoPredictor] Failed to read or parse ML output JSON. Output was: ${outputData}`);
                    reject(new Error('Invalid output from ML model'));
                }
            });

            // Write the JSON array to stdin
            try {
                const inputJson = JSON.stringify(flights);
                logger.info(`[MachineTwoPredictor] Writing ${inputJson.length} bytes to stdin`);
                pythonProcess.stdin.write(inputJson);
                pythonProcess.stdin.end();
            } catch (e) {
                logger.error(`[MachineTwoPredictor] Failed to write to Python stdin: ${e}`);
                pythonProcess.kill();
                reject(e);
            }
        });
    }
}


