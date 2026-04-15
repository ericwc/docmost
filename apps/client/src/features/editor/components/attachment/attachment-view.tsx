import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Group, Text, Paper, ActionIcon, Loader } from "@mantine/core";
import { getFileUrl } from "@/lib/config.ts";
import { IconDownload, IconPaperclip, IconEye } from "@tabler/icons-react";
import { useHover } from "@mantine/hooks";
import { formatBytes } from "@/lib";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import AttachmentPreview from "@/features/editor/components/attachment/attachment-preview";

export default function AttachmentView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, selected, editor } = props;
  const { url, name, size } = node.attrs;
  const { hovered, ref } = useHover();
  const [previewOpen, setPreviewOpen] = useState(false);

  const pageId = (editor?.storage as any)?.pageId;
  const canPreview = Boolean(url && pageId && isFilePreviewSupported(name));

  function isFilePreviewSupported(fileName: string): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const supportedExts = [
      'pdf',
      'doc', 'docx',
      'xls', 'xlsx',
      'ppt', 'pptx',
      'odt',
      'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp',
      'txt', 'csv'
    ];
    return ext ? supportedExts.includes(ext) : false;
  }

  return (
    <>
      <NodeViewWrapper>
        <Paper withBorder p="4px" ref={ref} data-drag-handle>
          <Group
            justify="space-between"
            gap="xl"
            style={{ cursor: "pointer" }}
            wrap="nowrap"
            h={25}
          >
            <Group wrap="nowrap" gap="sm" style={{ minWidth: 0, flex: 1 }}>
              {url ? (
                <IconPaperclip size={20} style={{ flexShrink: 0 }} />
              ) : (
                <Loader size={20} style={{ flexShrink: 0 }} />
              )}

              <Text component="span" size="md" truncate="end" style={{ minWidth: 0 }}>
                {url ? name : t("Uploading {{name}}", { name })}
              </Text>

              <Text component="span" size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                {formatBytes(size)}
              </Text>
            </Group>

            {url && (selected || hovered) && (
              <Group gap="xs">
                {canPreview && (
                  <ActionIcon
                    variant="default"
                    aria-label="preview file"
                    onClick={() => setPreviewOpen(true)}
                  >
                    <IconEye size={18} />
                  </ActionIcon>
                )}
                <a href={getFileUrl(url)} target="_blank" rel="noreferrer noopener">
                  <ActionIcon variant="default" aria-label="download file">
                    <IconDownload size={18} />
                  </ActionIcon>
                </a>
              </Group>
            )}
          </Group>
        </Paper>
      </NodeViewWrapper>

      {canPreview && (
        <AttachmentPreview
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          fileUrl={url}
          fileName={name}
          fileType={name.split('.').pop() || ''}
          pageId={pageId}
        />
      )}
    </>
  );
}