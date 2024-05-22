import { Request, Response, NextFunction } from "express";
import * as _ from "lodash"
import { schemaValidation } from "../helpers/ValidationService";
import { ResponseHandler } from "../helpers/ResponseHandler";
import { dbConnector } from "../routes/Router";
import { ErrorResponseHandler } from "../helpers/ErrorResponseHandler";

export const eventsValidationAgainstSchema = async (req: Request, res: Response, next: NextFunction) => {
    const errorHandler = new ErrorResponseHandler("DatasetService");
    try {
        const isLive = _.get(req, "body.isLive");
        const event = _.get(req, "body.event");
        const filters = _.get(req, "body.filters")
        let datasetRecord: any;
        let schema: any;

        if (isLive) {
            datasetRecord = await dbConnector.readRecords(isLive ? "datasets" : "datasets_draft", { filters: filters })
            schema = _.get(datasetRecord, "[0].data_schema")
        }

        if (_.isEmpty(datasetRecord)) {
            throw {
                "message": `Dataset ${filters?.dataset_id} does not exists`,
                "status": 404,
                "code": "NOT_FOUND"
            }
        }
        const validateEventAgainstSchema = schemaValidation(event, _.omit(schema, "$schema"));
        ResponseHandler.successResponse(req, res, { status: 200, data: { message: validateEventAgainstSchema?.message } });
    }
    catch (error) {
        return errorHandler.handleError(req, res, next, error);
    }
}