import React, { createContext, useContext, useState } from 'react';
import { cn } from '../../lib/utils';

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue>({
  value: '',
  onValueChange: () => {},
});

interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

function Tabs({
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = controlledValue ?? uncontrolledValue;
  const handleChange = (v: string) => {
    setUncontrolledValue(v);
    onValueChange?.(v);
  };

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleChange }}>
      <div className={cn('', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

function TabsList({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-lg bg-gray-100 p-1 text-gray-500',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

function TabsTrigger({
  value: triggerValue,
  className,
  children,
  ...props
}: TabsTriggerProps) {
  const { value, onValueChange } = useContext(TabsContext);
  const isActive = value === triggerValue;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2',
        isActive
          ? 'bg-white text-gray-900 shadow'
          : 'hover:text-gray-700',
        className,
      )}
      onClick={() => onValueChange(triggerValue)}
      {...props}
    >
      {children}
    </button>
  );
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

function TabsContent({
  value: contentValue,
  className,
  children,
  ...props
}: TabsContentProps) {
  const { value } = useContext(TabsContext);
  if (value !== contentValue) return null;

  return (
    <div
      role="tabpanel"
      className={cn('mt-2', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
