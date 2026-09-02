import { useRpc } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { getRows, type SheetMeta } from "../contracts.js";
import type { Styles } from "./theme.client.js";

const PAGE_SIZE = 200;

interface Props {
  workspaceId: string;
  relPath: string;
  sheets: SheetMeta[];
  styles: Styles;
}

export function SheetReader({ workspaceId, relPath, sheets, styles }: Props) {
  const [active, setActive] = useState(sheets[0]?.name ?? "");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const fetchRows = useRpc(getRows);

  const { data, isLoading, error } = useQuery({
    queryKey: ["rows", workspaceId, relPath, active, limit],
    queryFn: () => fetchRows({ workspaceId, relPath, sheet: active, offset: 0, limit }),
    enabled: Boolean(active),
  });

  if (sheets.length === 0) {
    return (
      <View style={styles.centre}>
        <Text style={styles.muted}>This workbook has no sheets</Text>
      </View>
    );
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <View style={styles.screen}>
      {/* Sheet picker. This is the whole reason spreadsheets are parsed rather
          than rasterised - the Azure inventory workbook has 33 named sheets
          that become 169 anonymous pages once it is converted to PDF. */}
      <ScrollView horizontal style={styles.bar} contentContainerStyle={{ gap: 8, alignItems: "center" }}>
        {sheets.map((sheet) => (
          <Pressable
            key={sheet.name}
            onPress={() => {
              setActive(sheet.name);
              setLimit(PAGE_SIZE);
            }}
            style={sheet.name === active ? styles.buttonOn : styles.button}
            accessibilityRole="button"
            accessibilityLabel={`Sheet ${sheet.name}, ${sheet.rowCount} rows`}
          >
            <Text style={sheet.name === active ? styles.buttonTextOn : styles.buttonText}>{sheet.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.centre}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <Text style={styles.danger}>{(error as Error).message}</Text>
      ) : (
        <ScrollView horizontal>
          <FlatList
            data={rows}
            keyExtractor={(_, i) => String(i)}
            onEndReached={() => {
              if (rows.length < total) setLimit((n) => Math.min(n + PAGE_SIZE, total));
            }}
            onEndReachedThreshold={0.6}
            ListFooterComponent={
              rows.length < total ? (
                <Text style={[styles.muted, { padding: styles.pad }]}>
                  Showing {rows.length} of {total} rows
                </Text>
              ) : null
            }
            renderItem={({ item, index }) => (
              <View style={{ flexDirection: "row", backgroundColor: index === 0 ? undefined : undefined }}>
                {item.map((cell, c) => (
                  <View key={c} style={styles.cell}>
                    <Text style={index === 0 ? styles.heading : styles.body} numberOfLines={3}>
                      {cell}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          />
        </ScrollView>
      )}
    </View>
  );
}
