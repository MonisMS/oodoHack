import type { RequestHandler } from "express";
import { AppError } from "../../lib/errors.js";
import * as service from "./service.js";
const handlers:Record<string,RequestHandler>={
'GET /summary':async(req,res)=>{const v=res.locals.validated;res.json({data:await service.summary(v.query,req.user!)});},
};
export const controller:RequestHandler=(req,res,next)=>{const handler=handlers[`${req.method} ${req.route.path}`];if(!handler)return next(new AppError(404,"NOT_FOUND","Endpoint not found"));return handler(req,res,next);};
