import React, { useState, useEffect } from 'react';
import { Modal, Loader, Text, Button, Group } from '@mantine/core';
import DocViewer, { DocViewerRenderers } from '@cyntler/react-doc-viewer';
import '@cyntler/react-doc-viewer/dist/index.css';
import { getFileUrl } from '@/lib/config';
import { useTranslation } from 'react-i18next';
import { getPublicFileUrl } from '@/features/attachments/services/attachment-service';

interface AttachmentPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  fileType: string;
  pageId: string;
}

export default function AttachmentPreview({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  fileType,
  pageId,
}: AttachmentPreviewProps) {
  const { t } = useTranslation();
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && fileUrl) {
      setLoading(true);
      setError(null);
      getPublicFileUrl(fileUrl, pageId)
        .then((url) => {
          setPublicUrl(url);
        })
        .catch((err) => {
          setError(t('Failed to load preview'));
          console.error('Error generating public URL', err);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setPublicUrl(null);
      setError(null);
    }
  }, [isOpen, fileUrl, pageId, t]);

  const docs = publicUrl ? [{ uri: publicUrl, fileName }] : [];

  const isOfficeFile = (fileName) => {
    const officeTypes = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
    const ext = fileName.split('.').pop().toLowerCase();
    return officeTypes.includes(ext);
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={t('Preview: {{fileName}}', { fileName })}
      size="calc(100% - 40px)"
      centered
      styles={{
        body: { padding: 0, height: '85vh' },
      }}
    >
      {loading && (
        <Group justify="center" p="xl">
          <Loader size="lg" />
          <Text>{t('Loading preview...')}</Text>
        </Group>
      )}

      {error && (
        <Group justify="center" p="xl">
          <Text c="red">{error}</Text>
          <Button
            variant="outline"
            onClick={() => window.open(getFileUrl(fileUrl), '_blank')}
          >
            {t('Download instead')}
          </Button>
        </Group>
      )}

      {!loading && !error && publicUrl && (
        isOfficeFile(fileName) ? (
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`}
            style={{
              width: '100%',
              height: '75vh',
              border: 'none',
            }}
            title={fileName}
          />
        ) : (
          <DocViewer
            documents={docs}
            pluginRenderers={DocViewerRenderers}
            config={{ header: { disableHeader: true } }}
            style={{ height: '100%', width: '100%' }}
          />
        )
      )}
    </Modal>
  );
}