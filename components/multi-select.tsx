"use client";

import * as React from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";

type Option = {
  label: string;
  value: string;
};

type MultiSelectProps = {
  options: Option[];
  values?: string[];
  onChange?: (values: string[]) => void;
};

export function MultiSelect({
  options,
  values = [],
  onChange,
}: MultiSelectProps) {
  const anchor = useComboboxAnchor();

  // Fast lookup instead of repeated .find()
  const optionsMap = React.useMemo(() => {
    return Object.fromEntries(options.map((o) => [o.value, o]));
  }, [options]);

  return (
    <Combobox
      multiple
      autoHighlight
      items={options} // ✅ IMPORTANT: objects, not strings
      value={values}
      onValueChange={onChange}
    >
      {/* Anchor wrapper is safer than relying on ref forwarding */}
      <div ref={anchor} className="w-full">
        <ComboboxChips>
          <ComboboxValue>
            {values.map((value) => {
              const option = optionsMap[value];
              return option ? (
                <ComboboxChip key={value}>{option.label}</ComboboxChip>
              ) : null;
            })}
            <ComboboxChipsInput />
          </ComboboxValue>
        </ComboboxChips>
      </div>

      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No items found.</ComboboxEmpty>

        <ComboboxList>
          {(item: Option) => (
            <ComboboxItem value={item.value} key={item.value}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
