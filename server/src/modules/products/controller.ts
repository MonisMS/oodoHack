import type { RequestHandler } from "express";
import { AppError } from "../../lib/errors.js";
import * as service from "./service.js";
const handlers:Record<string,RequestHandler>={
'GET /':async(req,res)=>{const v=res.locals.validated;res.json(await service.list(v.query,req.user!));},
'GET /:id':async(req,res)=>{const v=res.locals.validated;res.json({data:await service.get(v.params.id,req.user!)});},
'POST /':async(req,res)=>{const v=res.locals.validated;res.status(201).json({data:await service.create(v.body,req.user!)});},
'PUT /:id':async(req,res)=>{const v=res.locals.validated;res.json({data:await service.replace(v.params.id,v.body,req.user!)});},
'DELETE /:id':async(req,res)=>{const v=res.locals.validated;await service.remove(v.params.id,req.user!);res.status(204).end();},
'POST /:id/variants':async(req,res)=>{const v=res.locals.validated;res.status(201).json({data:await service.createVariant(v.params.id,v.body,req.user!)});},
'PUT /:id/variants/:variantId':async(req,res)=>{const v=res.locals.validated;res.json({data:await service.replaceVariant(v.params.id,v.params.variantId,v.body,req.user!)});},
'DELETE /:id/variants/:variantId':async(req,res)=>{const v=res.locals.validated;await service.removeVariant(v.params.id,v.params.variantId,req.user!);res.status(204).end();},
};
export const controller:RequestHandler=(req,res,next)=>{const handler=handlers[`${req.method} ${req.route.path}`];if(!handler)return next(new AppError(404,"NOT_FOUND","Endpoint not found"));return handler(req,res,next);};
