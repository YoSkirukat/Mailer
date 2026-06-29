"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { MailTemplate } from "@/lib/types";

const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024;

function ToolbarImageIcon() {
  return (
    <svg
      className="compose-toolbar-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Не удалось прочитать изображение"));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Не удалось прочитать изображение"));
    reader.readAsDataURL(file);
  });
}

export interface ComposeEditorHandle {
  getHtml: () => string;
  setHtml: (html: string) => void;
  insertHtml: (html: string) => void;
  focus: () => void;
}

interface ComposeEditorProps {
  initialHtml: string;
  onChange?: (html: string) => void;
  showTemplates?: boolean;
  templates?: MailTemplate[];
  onApplyTemplate?: (template: MailTemplate) => void;
}

function ToolbarButton({
  title,
  onClick,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`compose-toolbar-btn ${active ? "active" : ""}`}
      title={title}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export const ComposeEditor = forwardRef<ComposeEditorHandle, ComposeEditorProps>(
  function ComposeEditor(
    {
      initialHtml,
      onChange,
      showTemplates = false,
      templates = [],
      onApplyTemplate,
    },
    ref
  ) {
    const editorRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const templatesBtnRef = useRef<HTMLButtonElement>(null);
    const templatesMenuRef = useRef<HTMLDivElement>(null);
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const [templatesMenuStyle, setTemplatesMenuStyle] = useState<CSSProperties>({});
    const [portalReady, setPortalReady] = useState(false);

    const updateTemplatesMenuPosition = useCallback(() => {
      const button = templatesBtnRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const menuMaxHeight = 220;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceBelow < menuMaxHeight + 8 && rect.top > spaceBelow;

      setTemplatesMenuStyle({
        position: "fixed",
        right: Math.max(8, window.innerWidth - rect.right),
        minWidth: 220,
        ...(openAbove
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    }, []);

    useEffect(() => {
      setPortalReady(true);
    }, []);

    useEffect(() => {
      if (!templatesOpen) return;

      updateTemplatesMenuPosition();

      const handleLayoutChange = () => updateTemplatesMenuPosition();
      window.addEventListener("resize", handleLayoutChange);
      window.addEventListener("scroll", handleLayoutChange, true);

      return () => {
        window.removeEventListener("resize", handleLayoutChange);
        window.removeEventListener("scroll", handleLayoutChange, true);
      };
    }, [templatesOpen, updateTemplatesMenuPosition]);

    useEffect(() => {
      if (!templatesOpen) return;

      const handlePointerDown = (event: MouseEvent) => {
        const target = event.target as Node;
        if (templatesBtnRef.current?.contains(target)) return;
        if (templatesMenuRef.current?.contains(target)) return;
        setTemplatesOpen(false);
      };

      document.addEventListener("mousedown", handlePointerDown);
      return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [templatesOpen]);

    const exec = (command: string, value?: string) => {
      document.execCommand(command, false, value);
      editorRef.current?.focus();
      notifyChange();
    };

    const notifyChange = () => {
      if (!editorRef.current || !onChange) return;
      onChange(editorRef.current.innerHTML);
    };

    useImperativeHandle(ref, () => ({
      getHtml: () => editorRef.current?.innerHTML ?? "",
      setHtml: (html: string) => {
        if (editorRef.current) {
          editorRef.current.innerHTML = html;
          notifyChange();
        }
      },
      insertHtml: (html: string) => {
        editorRef.current?.focus();
        document.execCommand("insertHTML", false, html);
        notifyChange();
      },
      focus: () => editorRef.current?.focus(),
    }));

    useEffect(() => {
      if (editorRef.current && editorRef.current.innerHTML !== initialHtml) {
        editorRef.current.innerHTML = initialHtml;
      }
    }, [initialHtml]);

    const addLink = () => {
      const url = window.prompt("Введите ссылку", "https://");
      if (!url) return;
      exec("createLink", url);
    };

    const insertImage = async (file: File) => {
      if (!file.type.startsWith("image/")) {
        window.alert("Можно вставлять только изображения");
        return;
      }
      if (file.size > MAX_INLINE_IMAGE_BYTES) {
        window.alert("Изображение слишком большое (максимум 2 МБ)");
        return;
      }

      try {
        const dataUrl = await readImageFile(file);
        editorRef.current?.focus();
        document.execCommand(
          "insertHTML",
          false,
          `<img src="${dataUrl}" alt="" style="max-width:100%;height:auto;">`
        );
        notifyChange();
      } catch {
        window.alert("Не удалось вставить изображение");
      }
    };

    const handleImageSelected = (files: FileList | null) => {
      const file = files?.[0];
      if (file) void insertImage(file);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    };

    return (
      <div className="compose-editor">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => handleImageSelected(event.target.files)}
        />
        <div className="compose-toolbar">
          <ToolbarButton title="Жирный" onClick={() => exec("bold")}>
            <strong>Ж</strong>
          </ToolbarButton>
          <ToolbarButton title="Курсив" onClick={() => exec("italic")}>
            <em>К</em>
          </ToolbarButton>
          <ToolbarButton title="Подчёркнутый" onClick={() => exec("underline")}>
            <u>Ч</u>
          </ToolbarButton>
          <span className="compose-toolbar-sep" />
          <label className="compose-toolbar-color" title="Цвет текста">
            <span>A</span>
            <input
              type="color"
              defaultValue="#111827"
              onChange={(event) => exec("foreColor", event.target.value)}
            />
          </label>
          <label className="compose-toolbar-color compose-toolbar-highlight" title="Цвет фона">
            <span>A</span>
            <input
              type="color"
              defaultValue="#fef08a"
              onChange={(event) => exec("hiliteColor", event.target.value)}
            />
          </label>
          <span className="compose-toolbar-sep" />
          <select
            className="compose-toolbar-select"
            defaultValue="3"
            title="Размер"
            onChange={(event) => exec("fontSize", event.target.value)}
          >
            <option value="2">Мелкий</option>
            <option value="3">Обычный</option>
            <option value="4">Крупный</option>
            <option value="5">Большой</option>
          </select>
          <span className="compose-toolbar-sep" />
          <ToolbarButton title="Маркированный список" onClick={() => exec("insertUnorderedList")}>
            •≡
          </ToolbarButton>
          <ToolbarButton title="Нумерованный список" onClick={() => exec("insertOrderedList")}>
            1.
          </ToolbarButton>
          <span className="compose-toolbar-sep" />
          <ToolbarButton title="Отменить" onClick={() => exec("undo")}>
            ↶
          </ToolbarButton>
          <ToolbarButton title="Повторить" onClick={() => exec("redo")}>
            ↷
          </ToolbarButton>
          <span className="compose-toolbar-sep" />
          <ToolbarButton title="Ссылка" onClick={addLink}>
            🔗
          </ToolbarButton>
          <ToolbarButton
            title="Вставить изображение"
            onClick={() => imageInputRef.current?.click()}
          >
            <ToolbarImageIcon />
          </ToolbarButton>
          <ToolbarButton title="Очистить форматирование" onClick={() => exec("removeFormat")}>
            ✕
          </ToolbarButton>
          {showTemplates && (
            <>
              <span className="compose-toolbar-spacer" />
              <div className="compose-templates-wrap">
                <button
                  ref={templatesBtnRef}
                  type="button"
                  className="compose-templates-btn"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setTemplatesOpen((value) => {
                      const next = !value;
                      if (next) {
                        requestAnimationFrame(updateTemplatesMenuPosition);
                      }
                      return next;
                    });
                  }}
                >
                  Шаблоны
                </button>
                {portalReady &&
                  templatesOpen &&
                  createPortal(
                    <div
                      ref={templatesMenuRef}
                      className="compose-templates-menu compose-templates-menu--portal"
                      style={templatesMenuStyle}
                    >
                      {templates.length === 0 ? (
                        <p className="compose-templates-empty">
                          Нет шаблонов. Добавьте в настройках → Шаблоны
                        </p>
                      ) : (
                        <ul>
                          {templates.map((template) => (
                            <li key={template.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  onApplyTemplate?.(template);
                                  setTemplatesOpen(false);
                                }}
                              >
                                {template.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>,
                    document.body
                  )}
              </div>
            </>
          )}
        </div>
        <div
          ref={editorRef}
          className="compose-editor-body"
          contentEditable
          suppressContentEditableWarning
          onInput={notifyChange}
          role="textbox"
          aria-multiline
        />
      </div>
    );
  }
);
