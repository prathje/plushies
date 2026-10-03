// Exposes the library from source for lib.test.ts.
import * as THREE from 'three';
import {createPlushieCursor, fromCanvas, paintHighlight} from '../../src/index';

Object.assign(window, {THREE, createPlushieCursor, fromCanvas, paintHighlight, labReady: true});
