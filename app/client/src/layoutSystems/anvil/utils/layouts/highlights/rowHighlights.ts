import type {
  AnvilHighlightInfo,
  DeriveHighlightsFn,
  DraggedWidget,
  GetDimensions,
  LayoutProps,
  WidgetLayoutProps,
} from "../../anvilTypes";
import { HIGHLIGHT_SIZE } from "../../constants";
import { FlexLayerAlignment } from "layoutSystems/common/utils/constants";
import LayoutFactory from "layoutSystems/anvil/layoutComponents/LayoutFactory";
import {
  getFinalHorizontalDropZone,
  getHorizontalDropZone,
  getInitialHorizontalDropZone,
} from "./dropZoneUtils";
import { getInitialHighlights } from "./verticalHighlights";
import type {
  LayoutElementPosition,
  LayoutElementPositions,
} from "layoutSystems/common/types";
import { getRelativeDimensions } from "./dimensionUtils";

export interface RowMetaInformation {
  metaData: RowMetaData[][];
  tallestWidgets: WidgetLayoutProps[];
}

export interface RowMetaData extends WidgetLayoutProps, LayoutElementPosition {}

/**
 * @param layoutProps | LayoutProps
 * @param positions | LayoutElementPositions
 * @param canvasId | string
 * @param draggedWidgets | DraggedWidget[] : List of widgets that are being dragged
 * @param layoutOrder | string[] : Top - down hierarchy of layout IDs.
 * @param parentDropTarget | string : id of immediate drop target ancestor.
 * @returns AnvilHighlightInfo[] : List of highlights for the layout.
 */
export const deriveRowHighlights =
  (
    layoutProps: LayoutProps,
    canvasId: string,
    layoutOrder: string[],
    parentDropTarget: string,
  ) =>
  (
    positions: LayoutElementPositions,
    draggedWidgets: DraggedWidget[],
  ): AnvilHighlightInfo[] => {
    if (
      !layoutProps ||
      !positions ||
      !positions[layoutProps.layoutId] ||
      !draggedWidgets.length
    )
      return [];

    const { isDropTarget, layoutId, layoutStyle } = layoutProps;

    const parentDropTargetId: string = isDropTarget
      ? layoutId
      : parentDropTarget;

    const getDimensions: (id: string) => LayoutElementPosition =
      getRelativeDimensions(parentDropTargetId, positions);

    const baseHighlight: AnvilHighlightInfo = {
      alignment:
        layoutStyle && layoutStyle["justifyContent"]
          ? (layoutStyle["justifyContent"] as FlexLayerAlignment)
          : FlexLayerAlignment.Start,
      canvasId,
      dropZone: {},
      height: 0,
      isVertical: true,
      layoutOrder,
      posX: HIGHLIGHT_SIZE / 2,
      posY: HIGHLIGHT_SIZE / 2,
      rowIndex: 0,
      width: HIGHLIGHT_SIZE,
    };

    // If layout is empty, add an initial highlight.
    if (!layoutProps.layout?.length) {
      return getInitialHighlights(
        layoutProps,
        baseHighlight,
        generateHighlights,
        getDimensions,
        !!layoutProps.isDropTarget,
        false,
      );
    }

    // Check if layout renders widgets or layouts.
    const rendersWidgets: boolean = LayoutFactory.doesLayoutRenderWidgets(
      layoutProps.layoutType,
    );

    // It renders other layouts.
    if (!rendersWidgets) {
      return getHighlightsForLayoutRow(
        layoutProps,
        positions,
        baseHighlight,
        canvasId,
        draggedWidgets,
        layoutOrder,
        parentDropTargetId,
        getDimensions,
      );
    }

    return getHighlightsForWidgetsRow(
      layoutProps,
      baseHighlight,
      draggedWidgets,
      getDimensions,
    );
  };

/**
 * Derive highlights for a row of widgets.
 * 1. Derive meta information about the row.
 *  a. if it is flex wrapped.
 *  b. If yes, then how the widgets are positioned into multiple rows.
 * 2. Calculate highlights for each row of widgets.
 * @param layoutProps | LayoutProps
 * @param baseHighlight | AnvilHighlightInfo
 * @param draggedWidgets | DraggedWidget[] : List of dragged widgets.
 * @param getDimensions | GetDimensions : method to get relative dimensions of an entity.
 * @returns AnvilHighlightInfo[] : List of highlights.
 */
export function getHighlightsForWidgetsRow(
  layoutProps: LayoutProps,
  baseHighlight: AnvilHighlightInfo,
  draggedWidgets: DraggedWidget[],
  getDimensions: GetDimensions,
): AnvilHighlightInfo[] {
  // Get widget data
  const layout: WidgetLayoutProps[] = layoutProps.layout as WidgetLayoutProps[];

  // Extract meta information about row.
  const meta: RowMetaInformation = extractMetaInformation(
    layout,
    getDimensions,
  );

  // add a highlight before every widget and after the last one.
  const highlights: AnvilHighlightInfo[] = [];
  meta.metaData.forEach((row: RowMetaData[], index: number) => {
    highlights.push(
      ...getHighlightsForRow(
        row,
        meta.tallestWidgets[index],
        layoutProps,
        baseHighlight,
        draggedWidgets,
        getDimensions,
        highlights.length ? highlights[highlights.length - 1].rowIndex : 0, // Start subsequent wrapped row with the same index as the last index of the previous row.
      ),
    );
  });
  return highlights;
}

/**
 * Compute highlights for a row.
 * @param row | RowMetaData[] : Meta data on all widgets in the current row.
 * @param tallestWidget | WidgetLayoutProps : tallest widget in the current row.
 * @param layoutProps | LayoutProps : Properties of parent layout.
 * @param baseHighlight | AnvilHighlightInfo : Default highlight.
 * @param draggedWidgets | string[] : List of dragged widgets.
 * @param getDimensions | GetDimensions : method to get relative dimensions of an entity.
 * @param startingIndex | number : Starting index for the first highlight.
 * @returns AnvilHighlightInfo[]
 */
export function getHighlightsForRow(
  row: RowMetaData[],
  tallestWidget: WidgetLayoutProps,
  layoutProps: LayoutProps,
  baseHighlight: AnvilHighlightInfo,
  draggedWidgets: DraggedWidget[],
  getDimensions: GetDimensions,
  startingIndex = 0,
): AnvilHighlightInfo[] {
  const highlights: AnvilHighlightInfo[] = [];
  let index = 0;
  let draggedWidgetCount = 0;
  const { height, top } = getDimensions(tallestWidget.widgetId);

  const layoutDimensions: LayoutElementPosition = getDimensions(
    layoutProps.layoutId,
  );

  while (index < row.length) {
    const { widgetId } = row[index];
    const isDraggedWidget: boolean = draggedWidgets.some(
      (widget: DraggedWidget) => widget.widgetId === widgetId,
    );

    const prevWidgetDimensions: LayoutElementPosition | undefined =
      index === 0 ? undefined : row[index - 1];
    const nextWidgetDimensions: LayoutElementPosition | undefined =
      index === row.length - 1 ? undefined : row[index + 1];

    // Don't add highlights for widget if it is being dragged.
    if (!isDraggedWidget) {
      // Add a highlight before every widget in the row
      highlights.push(
        ...generateHighlights(
          baseHighlight,
          layoutDimensions,
          { ...row[index], height, top },
          prevWidgetDimensions,
          nextWidgetDimensions,
          index + startingIndex - draggedWidgetCount,
          false,
          !!layoutProps.isDropTarget,
        ),
      );
    } else draggedWidgetCount += 1;

    index += 1;

    // Add a highlight after the last widget in the row.
    if (index === row.length) {
      highlights.push(
        ...generateHighlights(
          baseHighlight,
          layoutDimensions,
          { ...row[index - 1], height, top },
          prevWidgetDimensions,
          nextWidgetDimensions,
          index + startingIndex - draggedWidgetCount,
          true,
          !!layoutProps.isDropTarget,
        ),
      );
      break;
    }
  }
  return highlights;
}

/**
 * Extract meta information about a row of widgets.
 * If row is flex wrapped, then find out which widgets are placed in each subsequent row.
 * Also, identify the tallest widget in each row.
 * @param layout | WidgetLayoutProps[] : list of widget ids
 * @param getDimensions | GetDimensions : function to get relative dimensions of a widget.
 * @returns RowMetaInformation
 */
export function extractMetaInformation(
  layout: WidgetLayoutProps[],
  getDimensions: GetDimensions,
): RowMetaInformation {
  const data: RowMetaData[][] = [];
  const tallestWidgets: WidgetLayoutProps[] = [];
  let curr: RowMetaData[] = [];
  let currentTallestWidget: WidgetLayoutProps = layout[0];
  let maxHeight = 0;
  for (const each of layout) {
    const dimensions: LayoutElementPosition = getDimensions(each.widgetId);
    if (!dimensions) continue;
    const { height, top } = dimensions;
    // If current row is empty, add the widget to it.
    if (!curr.length) {
      curr.push({ ...each, ...dimensions });
      // set maxHeight of current row equal to height of the first widget in the row.
      maxHeight = height;
      currentTallestWidget = each;
      // else check if there is intersection with the last widget in the current row.
    } else if (
      checkIntersection(
        [top, top + height],
        [
          curr[curr.length - 1].top,
          curr[curr.length - 1].top + curr[curr.length - 1].height,
        ],
      )
    ) {
      // If there is intersection, add the widget to the current row.
      curr.push({ ...each, ...dimensions });
      if (height > maxHeight) {
        maxHeight = height;
        currentTallestWidget = each;
      }
      // else start a new row.
    } else {
      // Add the current row to the data.
      data.push(curr);
      // Add the tallest widgets to the tallest widgets array.
      tallestWidgets.push(currentTallestWidget);
      // Reset the current row.
      curr = [{ ...each, ...dimensions }];
      // Reset the max height.
      maxHeight = height;
      currentTallestWidget = each;
    }
  }
  if (curr.length) {
    data.push(curr);
    tallestWidgets.push(currentTallestWidget);
  }
  return { metaData: data, tallestWidgets };
}

export function checkIntersection(a: number[], b: number[]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * This layout renders more layouts.
 * Calculate highlights for each child layout and combine them together.
 * @param layoutProps | LayoutProps
 * @param positions | LayoutElementPositions
 * @param baseHighlight | AnvilHighlightInfo
 * @param canvasId | string
 * @param layoutOrder |string[] : Top - down hierarchy of parent layouts.
 * @param parentDropTargetId | string : Id of immediate drop target ancestor.
 * @param getDimensions | GetDimensions : method to get relative dimensions of an entity.
 * @returns AnvilHighlightInfo[] : List of highlights
 */
export function getHighlightsForLayoutRow(
  layoutProps: LayoutProps,
  positions: LayoutElementPositions,
  baseHighlight: AnvilHighlightInfo,
  canvasId: string,
  draggedWidgets: DraggedWidget[],
  layoutOrder: string[],
  parentDropTargetId: string,
  getDimensions: GetDimensions,
): AnvilHighlightInfo[] {
  const highlights: AnvilHighlightInfo[] = [];
  const layout: LayoutProps[] = layoutProps.layout as LayoutProps[];

  let index = 0;
  // Loop over each child layout
  while (index < layout.length) {
    // Extract information on current child layout.
    const { isDropTarget, layoutId, layoutType } = layout[index];

    // Dimensions of neighboring layouts
    const prevLayoutDimensions: LayoutElementPosition | undefined =
      index === 0 ? undefined : getDimensions(layout[index - 1]?.layoutId);
    const nextLayoutDimensions: LayoutElementPosition | undefined =
      index === layout.length - 1
        ? undefined
        : getDimensions(layout[index + 1]?.layoutId);

    const layoutDimension: LayoutElementPosition = getDimensions(
      layoutProps.layoutId,
    );

    const currentDimension: LayoutElementPosition = getDimensions(layoutId);

    // Add a highlight before the child layout
    highlights.push(
      ...generateHighlights(
        baseHighlight,
        layoutDimension,
        currentDimension,
        prevLayoutDimensions,
        nextLayoutDimensions,
        index,
        false,
        !!layoutProps.isDropTarget,
      ),
    );

    /**
     * Add highlights of the child layout if it is not a drop target.
     * because if it is, then it can handle its own drag behavior.
     */
    if (!isDropTarget) {
      // Get the deriveHighlights function for the child layout.
      const deriveHighlightsFn: DeriveHighlightsFn =
        LayoutFactory.getDeriveHighlightsFn(layoutType);
      // Calculate highlights for the layout component.
      const layoutHighlights: AnvilHighlightInfo[] = deriveHighlightsFn(
        layout[index],
        canvasId,
        [...layoutOrder, layout[index].layoutId],
        parentDropTargetId,
      )(positions, draggedWidgets);

      highlights.push(...layoutHighlights);
    }

    index += 1;

    if (index === layout.length) {
      // Add a highlight for the drop zone below the child layout.
      highlights.push(
        ...generateHighlights(
          baseHighlight,
          layoutDimension,
          currentDimension,
          prevLayoutDimensions,
          nextLayoutDimensions,
          index,
          true,
          !!layoutProps.isDropTarget,
        ),
      );
    }
  }
  return highlights;
}

export function generateHighlights(
  baseHighlight: AnvilHighlightInfo,
  layoutDimension: LayoutElementPosition,
  currentDimension: LayoutElementPosition,
  prevDimension: LayoutElementPosition | undefined,
  nextDimension: LayoutElementPosition | undefined,
  rowIndex: number,
  isLastHighlight: boolean,
  isDropTarget?: boolean,
): AnvilHighlightInfo[] {
  const isInitialHighlight: boolean = rowIndex === 0;
  return [
    {
      ...baseHighlight,
      dropZone: isLastHighlight
        ? isInitialHighlight
          ? getInitialHorizontalDropZone(currentDimension, layoutDimension)
          : getFinalHorizontalDropZone(
              currentDimension,
              layoutDimension,
              !!isDropTarget,
            )
        : getHorizontalDropZone(
            currentDimension,
            prevDimension,
            nextDimension,
            !!isDropTarget,
          ),
      height: currentDimension.height,
      posX: isLastHighlight
        ? isInitialHighlight
          ? currentDimension.left
          : Math.min(
              currentDimension.left +
                currentDimension.width +
                HIGHLIGHT_SIZE / 2,
              layoutDimension.left + layoutDimension.width - HIGHLIGHT_SIZE,
            )
        : Math.max(currentDimension.left - HIGHLIGHT_SIZE, HIGHLIGHT_SIZE / 2),
      posY: currentDimension.top,
      rowIndex,
    },
  ];
}
