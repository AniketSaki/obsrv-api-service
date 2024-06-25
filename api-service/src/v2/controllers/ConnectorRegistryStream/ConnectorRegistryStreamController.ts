import { Request, Response } from "express";
import { ResponseHandler } from "../../helpers/ResponseHandler";
import _ from "lodash";
import logger from "../../logger";
import { config } from "../../configs/Config";
import axios from "axios";
import httpStatus from "http-status";
import busboy from "busboy";
import { v4 } from "uuid"
import { PassThrough } from "stream";
import { URLAccess } from "../../types/SampleURLModel";
import { ErrorObject } from "../../types/ResponseModel";

export const apiId = "api.files.generate-url";
export const code = "FILES_GENERATE_URL_FAILURE";

const apiServiceHost = _.get(config, ["obsrv_api_service_config", "host"]);
const apiServicePort = _.get(config, ["obsrv_api_service_config", "port"]);
const generateSignedURLPath = _.get(config, ["obsrv_api_service_config", "generate_url_path"]);

const commandServiceHost = _.get(config, ["command_service_config", "host"]);
const commandServicePort = _.get(config, ["command_service_config", "port"]);
const registryUrl = _.get(config, ["command_service_config", "connector_registry_path"])

const getGenerateSignedURLRequestBody = (files: string[], access: string) => ({
    id: apiId,
    ver: "v2",
    ts: new Date().toISOString(),
    params: {
        msgid: v4()
    },
    request: {
        files,
        access: access || URLAccess.Read,
        type: "connector"
    }
});

const connectorRegistryStream = async (req: Request, res: Response) => {
    const resmsgid = _.get(res, "resmsgid");
    try {
        const uploadStreamResponse: any = await uploadStream(req);
        const registryRequestBody = {
            relative_path: uploadStreamResponse[0]
        }
        logger.info({ apiId, resmsgid, message: `File uploaded to cloud provider successfully` })
        const registryResponse = await axios.post(`${commandServiceHost}:${commandServicePort}${registryUrl}`, registryRequestBody);
        logger.info({ apiId, resmsgid, message: `Connector registered successfully` })
        ResponseHandler.successResponse(req, res, { status: httpStatus.OK, data: { message: registryResponse?.data?.message } })
    } catch (error: any) {
        logger.error(error, apiId, resmsgid, code);
        let errorMessage = error;
        const statusCode = _.get(error, "statusCode")
        if (!statusCode || statusCode == 500) {
            errorMessage = { code, message: "Failed to read dataset" }
        }
        ResponseHandler.errorResponse(errorMessage, req, res);
    }
};

export const generatePresignedUrl = async (fileName: string, access: string) => {
    try {
        const requestBody = getGenerateSignedURLRequestBody([fileName], access);
        const response = await axios.post(`${apiServiceHost}:${apiServicePort}${generateSignedURLPath}`, requestBody);
        return response?.data?.result;
    }
    catch (err) {
        throw {
            code: "FILES_GENERATE_URL_FAILURE",
            message: "Failed to generate sample urls",
            statusCode: 400,
            errCode: "BAD_REQUEST"
        } as ErrorObject
    }
};

const uploadStream = async (req: Request) => {
    return new Promise((resolve, reject) => {
        const filePromises: Promise<void>[] = [];
        const bb = busboy({ headers: req.headers });
        const match: any[] = [];
        let fileCount = 0;

        bb.on("file", async (name: any, file: any, info: any) => {
            if (fileCount > 0) {
                // If more than one file is detected, reject the request
                bb.emit("error", reject({
                    code: "FAILED_TO_UPLOAD",
                    message: "Uploading multiple files are not allowed",
                    statusCode: 400,
                    errCode: "BAD_REQUEST"
                }));
                return
            }
            fileCount++;
            const processFile = async () => {
                const fileName = info?.filename;
                const preSignedUrl: any = await generatePresignedUrl(fileName, URLAccess.Write);
                const filePath = preSignedUrl[0]?.filePath
                const regex = /(?<=\/)[^/]+\.[^/]+(?=\/|$)/g;
                match.push(...filePath.match(regex));
                const pass = new PassThrough();
                file.pipe(pass);
                const fileBuffer = await streamToBuffer(pass);
                await axios.put(preSignedUrl[0]?.preSignedUrl, fileBuffer, {
                    headers: {
                        "Content-Type": info.mimeType,
                        "Content-Length": fileBuffer.length,
                    }
                });
            };
            filePromises.push(processFile());
        });
        bb.on("close", async () => {
            try {
                await Promise.all(filePromises);
                resolve(match);
            } catch (error) {
                reject(error);
            }
        });
        bb.on("error", reject);
        req.pipe(bb);
    })
}

const streamToBuffer = (stream: PassThrough): Promise<Buffer> => {
    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
};

export default connectorRegistryStream;
