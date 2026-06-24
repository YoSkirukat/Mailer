import { NextResponse } from "next/server";

import { getAccountWithPassword } from "@/lib/db";

import { isValidFolderId } from "@/lib/folders";

import { setEmailAnswered } from "@/lib/imap";

import { sendMail } from "@/lib/smtp";



export async function POST(request: Request) {

  try {

    const body = await request.json();

    const { accountId, to, subject, text, replyTo } = body;



    if (!accountId || !to?.trim() || !subject?.trim() || !text?.trim()) {

      return NextResponse.json(

        { error: "Заполните все поля письма" },

        { status: 400 }

      );

    }



    const account = getAccountWithPassword(accountId);

    if (!account) {

      return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });

    }



    await sendMail(account, {

      to: to.trim(),

      subject: subject.trim(),

      text: text.trim(),

    });



    if (

      replyTo?.accountId &&

      replyTo?.uid &&

      replyTo?.folder &&

      isValidFolderId(replyTo.folder)

    ) {

      const sourceAccount = getAccountWithPassword(replyTo.accountId);

      if (sourceAccount) {

        try {

          await setEmailAnswered(

            sourceAccount,

            replyTo.folder,

            Number(replyTo.uid)

          );

        } catch {

          /* ответ отправлен, флаг на сервере необязателен */

        }

      }

    }



    return NextResponse.json({ ok: true });

  } catch (error) {

    return NextResponse.json(

      { error: error instanceof Error ? error.message : "Не удалось отправить" },

      { status: 400 }

    );

  }

}

