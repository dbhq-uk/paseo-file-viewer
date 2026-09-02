import { useRpc } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { listFiles, type FileEntry } from "../contracts.js";
import { humanSize, KIND_LABEL, type Styles } from "./theme.client.js";

interface Props {
  workspaceId: string;
  styles: Styles;
  onOpen: (file: FileEntry) => void;
}

export function FileList({ workspaceId, styles, onOpen }: Props) {
  const fetchFiles = useRpc(listFiles);
  const [filter, setFilter] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["files", workspaceId],
    queryFn: () => fetchFiles({ workspaceId }),
  });

  const shown = useMemo(() => {
    const files = data?.files ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return files;
    return files.filter((f) => f.relPath.toLowerCase().includes(needle));
  }, [data, filter]);

  if (isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return <Text style={styles.danger}>{(error as Error).message}</Text>;
  }

  return (
    <View style={styles.screen}>
      <TextInput
        style={styles.input}
        value={filter}
        onChangeText={setFilter}
        placeholder="Filter by name or folder"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Filter files"
      />
      <FlatList
        data={shown}
        keyExtractor={(item) => item.relPath}
        ListEmptyComponent={
          <View style={styles.centre}>
            <Text style={styles.muted}>
              {filter ? "Nothing matches that filter" : "No viewable files in this workspace"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.name}, ${KIND_LABEL[item.kind]}, ${humanSize(item.sizeBytes)}`}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.body} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {KIND_LABEL[item.kind]} · {humanSize(item.sizeBytes)} · {item.relPath}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
