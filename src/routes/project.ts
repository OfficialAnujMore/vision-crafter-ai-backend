import { Router, Request, Response } from "express";
import { prisma } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { deleteObject } from "../utils/s3.js";

const router = Router();

// All project routes require authentication
router.use(requireAuth);

function serializeProject(project: {
  id: string;
  fileId: string;
  userId: number;
  title: string;
  projectUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  fileType: string;
  canvasState: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  let canvasState = null;
  if (project.canvasState) {
    try {
      canvasState = JSON.parse(project.canvasState);
    } catch {
      canvasState = null;
    }
  }

  return {
    id: project.id,
    file_id: project.fileId,
    user_id: project.userId,
    title: project.title,
    project_url: project.projectUrl,
    thumbnail_url: project.thumbnailUrl,
    width: project.width,
    height: project.height,
    file_type: project.fileType,
    canvas_state: canvasState,
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  };
}

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

// POST /api/projects/create
router.post("/create", async (req: Request, res: Response) => {
  const userId = parseInt(req.user!.sub as string);

  const { file_id, title, project_url, thumbnail_url, width, height, file_type, canvas_state } =
    req.body;

  const canvasStateJson = canvas_state ? JSON.stringify(canvas_state) : null;

  try {
    const project = await prisma.project.create({
      data: {
        fileId: file_id,
        userId,
        title,
        projectUrl: project_url,
        thumbnailUrl: thumbnail_url,
        width,
        height,
        fileType: file_type,
        canvasState: canvasStateJson,
      },
    });

    res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: serializeProject(project),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({
      success: false,
      message: `Failed to create project: ${message}`,
      statusCode: 500,
    });
  }
});

// GET /api/projects/:projectId
router.get("/:projectId", async (req: Request, res: Response) => {
  const currentUserId = parseInt(req.user!.sub as string);
  const projectId = getParam(req.params.projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    res.status(404).json({
      success: false,
      message: `Project with id ${projectId} not found`,
      statusCode: 404,
    });
    return;
  }

  if (project.userId !== currentUserId) {
    res.status(403).json({
      success: false,
      message: "You don't have access to this project",
      statusCode: 403,
    });
    return;
  }

  res.json({
    success: true,
    data: serializeProject(project),
  });
});

// GET /api/projects/user/:userId
router.get("/user/:userId", async (req: Request, res: Response) => {
  const currentUserId = parseInt(req.user!.sub as string);
  const userId = parseInt(getParam(req.params.userId));

  if (userId !== currentUserId) {
    res.status(403).json({
      success: false,
      message: "You can only access your own projects",
      statusCode: 403,
    });
    return;
  }

  const projects = await prisma.project.findMany({
    where: { userId: currentUserId },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    success: true,
    data: projects.map(serializeProject),
  });
});

// Shared update logic for PUT and PATCH
async function handleUpdate(req: Request, res: Response) {
  const currentUserId = parseInt(req.user!.sub as string);
  const projectId = getParam(req.params.projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    res.status(404).json({
      success: false,
      message: `Project with id ${projectId} not found`,
      statusCode: 404,
    });
    return;
  }

  if (project.userId !== currentUserId) {
    res.status(403).json({
      success: false,
      message: "You are not authorized to update this project",
      statusCode: 403,
    });
    return;
  }

  const updateData: Record<string, unknown> = {};
  const body = req.body;

  if (body.title !== undefined && body.title !== null) {
    updateData.title = body.title;
  }
  if (body.project_url !== undefined && body.project_url !== null) {
    updateData.projectUrl = body.project_url;
  }
  if (body.thumbnail_url !== undefined && body.thumbnail_url !== null) {
    updateData.thumbnailUrl = body.thumbnail_url;
  }
  if (body.width !== undefined && body.width !== null) {
    updateData.width = body.width;
  }
  if (body.height !== undefined && body.height !== null) {
    updateData.height = body.height;
  }
  if (body.file_type !== undefined && body.file_type !== null) {
    updateData.fileType = body.file_type;
  }
  if (body.canvas_state !== undefined && body.canvas_state !== null) {
    updateData.canvasState = JSON.stringify(body.canvas_state);
  }

  updateData.updatedAt = new Date();

  try {
    const updated = await prisma.project.update({
      where: { id: projectId },
      data: updateData,
    });

    res.json({
      success: true,
      message: "Project updated successfully",
      data: serializeProject(updated),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({
      success: false,
      message: `Failed to update project: ${message}`,
      statusCode: 500,
    });
  }
}

// PUT /api/projects/:projectId
router.put("/:projectId", handleUpdate);

// PATCH /api/projects/:projectId
router.patch("/:projectId", handleUpdate);

router.delete("/:projectId", async (req: Request, res: Response) => {
  const currentUserId = parseInt(req.user!.sub as string);
  const projectId = getParam(req.params.projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    res.status(404).json({
      success: false,
      message: `Project with id ${projectId} not found`,
      statusCode: 404,
    });
    return;
  }

  if (project.userId !== currentUserId) {
    res.status(403).json({
      success: false,
      message: "You are not authorized to delete this project",
      statusCode: 403,
    });
    return;
  }

  try {
    await deleteObject(project.fileId);

    await prisma.project.delete({
      where: { id: projectId },
    });

    res.status(204).send();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({
      success: false,
      message: `Failed to delete project: ${message}`,
      statusCode: 500,
    });
  }
});

export default router;
