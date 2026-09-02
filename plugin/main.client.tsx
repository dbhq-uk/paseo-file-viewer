import { useRpc, type PluginWorkspacePanelProps } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { openDoc, type FileEntry } from "./contracts.js";
import { DocReader } from "./client/DocReader.client.js";
import { FileList } from "./client/FileList.client.js";
import { PageReader } from "./client/PageReader.client.js";
import { SheetReader } from "./client/SheetReader.client.js";
import { makeStyles } from "./client/theme.client.js";

/** Opens the selected file and hands off to the reader that suits its kind. */
function Reader({
  workspaceId,
  file,
  styles,
}: {
  workspaceId: string;
  file: FileEntry;
  styles: ReturnType<typeof makeStyles>;
}) {
  const open = useRpc(openDoc);
  const { data, isLoading, error } = useQuery({
    queryKey: ["open", workspaceId, file.relPath],
    queryFn: () => open({ workspaceId, relPath: file.relPath }),
  });

  if (isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error) return <Text style={styles.danger}>{(error as Error).message}</Text>;
  if (!data) return null;

  if (data.kind === "document") return <DocReader blocks={data.blocks} styles={styles} />;
  if (data.kind === "sheet") {
    return <SheetReader workspaceId={workspaceId} relPath={file.relPath} sheets={data.sheets} styles={styles} />;
  }
  return <PageReader workspaceId={workspaceId} relPath={file.relPath} pages={data.pages} styles={styles} />;
}

export function FileViewerPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const styles = useMemo(() => makeStyles(theme, layout.compact), [theme, layout.compact]);
  const [open, setOpen] = useState<FileEntry | null>(null);

  if (!open) {
    return <FileList workspaceId={workspaceId} styles={styles} onOpen={setOpen} />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <Pressable onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel="Back to file list">
          <Text style={styles.buttonText}>‹ Files</Text>
        </Pressable>
        <Text style={[styles.muted, { flex: 1 }]} numberOfLines={1}>
          {open.name}
        </Text>
      </View>
      <Reader workspaceId={workspaceId} file={open} styles={styles} />
    </View>
  );
}
