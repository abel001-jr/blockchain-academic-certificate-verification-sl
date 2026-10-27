import React, {useEffect, useRef} from "react";
import {ScrollView, Text, TouchableOpacity, View} from "react-native";
import {colors as T} from "../theme";

const ROW = 48;

export default function DurationWheel({label, values, value, onChange, disabled = false}) {
  const scroll = useRef(null);
  const settleTimer = useRef(null);
  const selectedIndex = Math.max(0, values.indexOf(value));
  useEffect(() => {
    scroll.current?.scrollTo({y: selectedIndex * ROW, animated: false});
  }, [selectedIndex, values.length]);
  useEffect(() => () => clearTimeout(settleTimer.current), []);

  function settle(y) {
    const index = Math.max(0, Math.min(values.length - 1, Math.round(y / ROW)));
    scroll.current?.scrollTo({y: index * ROW, animated: true});
    onChange(values[index]);
  }

  return <View style={{flex: 1, alignItems: "center", gap: 8}}>
    <Text style={{fontSize: 12, fontWeight: "600", color: T.muted}}>{label}</Text>
    <View style={{height: ROW * 3, width: "100%", overflow: "hidden"}}>
      <View pointerEvents="none" style={{position: "absolute", top: ROW, left: 4, right: 4, height: ROW, backgroundColor: T.input, borderRadius: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.border}} />
      <ScrollView ref={scroll} nestedScrollEnabled scrollEnabled={!disabled && values.length > 1} showsVerticalScrollIndicator={false} snapToInterval={ROW} decelerationRate="fast" scrollEventThrottle={16}
        contentContainerStyle={{paddingVertical: ROW}}
        onScroll={event => {
          const y = event.nativeEvent.contentOffset.y;
          clearTimeout(settleTimer.current);
          settleTimer.current = setTimeout(() => settle(y), 160);
        }}
        onMomentumScrollEnd={event => { clearTimeout(settleTimer.current); settle(event.nativeEvent.contentOffset.y); }}>
        {values.map((number, index) => <TouchableOpacity key={number} disabled={disabled} accessibilityRole="radio" accessibilityLabel={`${number} ${label.toLowerCase()}`} accessibilityState={{selected: number === value, disabled}} onPress={() => { clearTimeout(settleTimer.current); settle(index * ROW); }} style={{height: ROW, alignItems: "center", justifyContent: "center"}}>
          <Text style={{fontSize: number === value ? 36 : 29, fontWeight: number === value ? "600" : "400", color: T.navy, opacity: number === value ? 1 : .25, fontVariant: ["tabular-nums"]}}>{String(number).padStart(2, "0")}</Text>
        </TouchableOpacity>)}
      </ScrollView>
    </View>
  </View>;
}
