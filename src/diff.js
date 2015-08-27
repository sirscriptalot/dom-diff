'use strict';

import * as types from './types';
import { KEY_NEW_INDEX } from './constants';
import compareNode from './compare/node';
import compareNodes from './compare/nodes';

export default function diff (opts) {
  let dst = opts.destination;
  let src = opts.source;
  let instructions = [];

  if (!src || !dst) {
    return [];
  }

  let dstChs = dst.childNodes;
  let dstChsLen = dstChs.length;
  let dstInSrcMap = [];
  let srcChs = src.childNodes;
  let srcChsLen = srcChs.length;
  let srcInDstMap = [];

  // If there's only one child in both source and destination, we can check to
  // see if they're the same, or replace the source with the destination if not
  // and simply return from here without doing any further operations.
  if (dstChsLen === 1 && srcChsLen === 1) {
    let dstCh = dstChs[0];
    let srcCh = srcChs[0];
    let nodeInstructions = compareNode(srcCh, dstCh);

    // If it's the same node then there may be instructions to alter it so we
    // just return those.
    if (nodeInstructions) {
      return nodeInstructions;
    } else {
      return [{
        destination: dstCh,
        source: srcCh,
        type: types.REPLACE_CHILD
      }];
    }
  }

  // Add nodes that don't exist in the source.
  for (let a = 0; a < dstChsLen; a++) {
    let dstCh = dstChs[a];
    let srcCh = srcChs[a];
    let nodeInstructions = compareNode(srcCh, dstCh);

    // If there are instructions, then the nodes are the same so concat those
    // and mark its index so we can ensure it's where it needs to be later.
    if (nodeInstructions) {
      instructions = instructions.concat(nodeInstructions);
      dstInSrcMap.push(dstCh);
      srcInDstMap.push(srcCh);
      srcCh[KEY_NEW_INDEX] = a;
      continue;
    }

    // Now try and find in the source.
    let dstInSrcChs = compareNodes(srcChs, dstCh);

    // If the destination is in the source, we add the new key to it so that
    // we can ensure it gets moved to the right spot later.
    if (dstInSrcChs.index > -1) {
      dstInSrcMap.push(dstCh);
      srcInDstMap.push(srcChs[dstInSrcChs.index]);
      srcChs[dstInSrcChs.index][KEY_NEW_INDEX] = a;
      instructions = instructions.concat(dstInSrcChs.instructions);
      continue;
    }

    // If there are same nodes, we take the last node that we found and insert
    // after that one. This ensures destination nodes get placed where they're
    // supposed to be rather than just appended.
    if (dstInSrcMap.length) {
      let srcToInsertAfter = srcInDstMap[srcInDstMap.length - 1];
      let srcToInsertBefore = srcToInsertAfter.nextSibling;
      instructions.push({
        destination: dstCh,
        source: srcToInsertBefore || src,
        type: srcToInsertBefore ? types.INSERT_BEFORE : types.APPEND_CHILD
      });
      continue;
    }

    // If there are no destination nodes found in the source yet then we
    // prepend.
    instructions.push({
      destination: dstCh,
      source: srcChsLen ? srcChs[0] : src,
      type: srcChsLen ? types.INSERT_BEFORE : types.APPEND_CHILD
    });
  }

  // Remove any nodes in the source that don't exist in the destination.
  let moves = [];
  for (let a = 0; a < srcChsLen; a++) {
    let srcCh = srcChs[a];

    // The node has moved. We record this so that we can append the moves to
    // the end of the instructions array.
    if (srcCh[KEY_NEW_INDEX] > -1) {
      moves.push({
        destination: srcCh[KEY_NEW_INDEX],
        source: srcCh,
        type: types.MOVE_TO
      });
      delete srcCh[KEY_NEW_INDEX];
      continue;
    }

    // If the source does not exist in the destination, remove it.
    instructions.push({
      destination: null,
      source: srcCh,
      type: types.REMOVE_CHILD
    });
  }

  // Move instructions must come last to ensure that all attachments and
  // detachments have been carried out at this level in the tree. This ensures
  // that the source's length is the same as the destination's length and that
  // indexes where nodes need to be moved is accurate.
  instructions = instructions.concat(moves);

  // For the nodes that exist in both diff objects, we diff their trees.
  let dstInSrcMapLen = dstInSrcMap.length;
  for (let a = 0; a < dstInSrcMapLen; a++) {
    instructions = instructions.concat(diff(srcInDstMap[a], dstInSrcMap[a]));
  }

  return instructions;
}
