import { NextResponse } from "next/server";
import { isValidFolderId } from "@/lib/folders";
import { assignLabel, unassignLabel } from "@/lib/labels-db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accountId, folder: folderParam, uid, labelId } = body as {
      accountId?: string;
      folder?: string;
      uid?: number;
      labelId?: string;
    };

    const folder =
      folderParam && isValidFolderId(folderParam) ? folderParam : "inbox";

    if (!accountId || !uid || !labelId) {
      return NextResponse.json(
        { error: "Укажите accountId, uid и labelId" },
        { status: 400 }
      );
    }

    assignLabel({ accountId, folder, uid }, labelId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось назначить ярлык" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { accountId, folder: folderParam, uid, labelId } = body as {
      accountId?: string;
      folder?: string;
      uid?: number;
      labelId?: string;
    };

    const folder =
      folderParam && isValidFolderId(folderParam) ? folderParam : "inbox";

    if (!accountId || !uid || !labelId) {
      return NextResponse.json(
        { error: "Укажите accountId, uid и labelId" },
        { status: 400 }
      );
    }

    unassignLabel({ accountId, folder, uid }, labelId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось снять ярлык" },
      { status: 400 }
    );
  }
}
