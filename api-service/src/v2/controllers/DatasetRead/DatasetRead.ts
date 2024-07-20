import { Request, Response } from "express";
import httpStatus from "http-status";
import _ from "lodash";
import { ResponseHandler } from "../../helpers/ResponseHandler";
import { DatasetDraft } from "../../models/DatasetDraft";
import { datasetService } from "../../services/DatasetService";
import { obsrvError } from "../../types/ObsrvError";

export const apiId = "api.datasets.read";
export const errorCode = "DATASET_READ_FAILURE"

// TODO: Move this to a config
const defaultFields = ["dataset_id", "name", "type", "status", "tags", "version", "api_version", "dataset_config"]

const validateRequest = (req: Request) => {

    const { dataset_id } = req.params;
    const fields = req.query.fields;
    if(fields && typeof fields !== "string") {
        throw obsrvError(dataset_id, "DATASET_INVALID_FIELDS_VAL", `The specified fields [${fields}] in the query param is not a string.`, "BAD_REQUEST", 400);
    }
    const fieldValues = fields ? _.split(fields, ",") : [];
    const invalidFields = _.difference(fieldValues, Object.keys(DatasetDraft.getAttributes()));
    if (!_.isEmpty(invalidFields)) {
        throw obsrvError(dataset_id, "DATASET_INVALID_FIELDS", `The specified fields [${invalidFields}] in the dataset cannot be found.`, "BAD_REQUEST", 400);
    }

}

const datasetRead = async (req: Request, res: Response) => {

    validateRequest(req);
    const { dataset_id } = req.params;
    const { fields, mode } = req.query;
    const attributes = !fields ? defaultFields : _.split(<string>fields, ",");
    const dataset = (mode == "edit") ? await readDraftDataset(dataset_id, attributes) : await readDataset(dataset_id, attributes)
    if(!dataset) {
        throw obsrvError(dataset_id, "DATASET_NOT_FOUND", `Dataset with the given dataset_id:${dataset_id} not found`, "NOT_FOUND", 404);
    } else {
        ResponseHandler.successResponse(req, res, { status: httpStatus.OK, data: dataset });
    }
}

const readDraftDataset = async (datasetId: string, attributes: string[]): Promise<any> => {
    
    const attrs = _.union(attributes, ["dataset_config", "api_version", "type"])
    const draftDataset = await datasetService.getDraftDataset(datasetId, attrs);
    if(draftDataset) { // Contains a draft
        const apiVersion = _.get(draftDataset, ["api_version"]);
        const dataset: any = (apiVersion === "v2") ? draftDataset : await datasetService.migrateDraftDataset(datasetId, draftDataset)
        return _.pick(dataset, attributes); 
    }

    const liveDataset = await datasetService.getDataset(datasetId, undefined, true);
    if(liveDataset) {
        const dataset = await datasetService.createDraftDatasetFromLive(liveDataset)
        return _.pick(dataset, attributes); 
    }
    
    return null;
}

const readDataset = async (datasetId: string, attributes: string[]): Promise<any> => {
    const dataset = await datasetService.getDataset(datasetId, attributes, true);
    return dataset;
}

export default datasetRead;