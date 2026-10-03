// Exposes the viewer from source for viewer.test.ts.
import * as THREE from 'three';
import {mountPlushie} from '../../../src/viewer';

Object.assign(window, {THREE, mountPlushie, labReady: true});
