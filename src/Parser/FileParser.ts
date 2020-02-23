import ClassModel from '../Model/ClassModel';

import Scope from '../Scope';

import ClassParser from './ClassParser';
import MethodParser from './MethodParser';
import PropertyParser from './PropertyParser';

import { peek } from '../utils';

export default class FileParser {
  parseFileContents(rawFileContents: string): ClassModel | null {
    if (rawFileContents.length === 0) {
      return null;
    }

    let commentsStarted = false;
    let docBlockStarted = false;
    let nestedCurlyBraceDepth = 0;
    let lstComments = [];
    let cModel = null;
    let cModelParent;
    let cModels = [];

    let contentLines = this.splitAndClean(rawFileContents);
    // TODO: There is no difference between iLine and i, let's get rid of one
    let iLine = 0;

    for (let i = 0; i < contentLines.length; i++) {
      let strLine = contentLines[i];
      iLine++;

      strLine = strLine.trim();
      if (strLine.length === 0) {
        continue;
      }

      // ignore anything after // style comments. this allows hiding of tokens from ApexDoc.
      let ich = strLine.indexOf('//');
      if (ich > -1) {
        strLine = strLine.substring(0, ich);
      }

      // gather up our comments
      if (strLine.startsWith('/*')) {
        commentsStarted = true;
        let commentEnded = false;
        if (strLine.startsWith('/**')) {
          if (strLine.endsWith('*/')) {
            strLine = strLine.replace('*/', '');
            commentEnded = true;
          }
          lstComments.push(strLine);
          docBlockStarted = true;
        }
        if (strLine.endsWith('*/') || commentEnded) {
          commentsStarted = false;
          docBlockStarted = false;
        }
        continue;
      }

      if (commentsStarted && strLine.endsWith('*/')) {
        strLine = strLine.replace('*/', '');
        if (docBlockStarted) {
          lstComments.push(strLine);
          docBlockStarted = false;
        }
        commentsStarted = false;
        continue;
      }

      if (commentsStarted) {
        if (docBlockStarted) {
          lstComments.push(strLine);
        }
        continue;
      }

      // keep track of our nesting so we know which class we are in
      let openCurlies = this.countChars(strLine, '{');
      let closeCurlies = this.countChars(strLine, '}');
      nestedCurlyBraceDepth += openCurlies;
      nestedCurlyBraceDepth -= closeCurlies;

      // if we are in a nested class, and we just got back to nesting level 1,
      // then we are done with the nested class, and should set its props and methods.
      if (nestedCurlyBraceDepth == 1 && openCurlies != closeCurlies && cModels.length > 1 && cModel != null) {
        cModels.pop();
        cModel = peek(cModels);
        continue;
      }

      // ignore anything after an =. this avoids confusing properties with methods.
      ich = strLine.indexOf('=');
      if (ich > -1) {
        strLine = strLine.substring(0, ich);
      }

      // ignore anything after an {. this avoids confusing properties with methods.
      ich = strLine.indexOf('{');
      if (ich > -1) {
        strLine = strLine.substring(0, ich);
      }

      //ignore lines not dealing with scope
      if (
        this.strContainsScope(strLine) === null &&
        // interface methods don't have scope
        !(cModel != null && cModel.getIsInterface() && strLine.includes('('))
      ) {
        continue;
      }

      // look for a class
      if (strLine.toLowerCase().includes(' class ') || strLine.toLowerCase().includes(' interface ')) {
        // create the new class
        let cModelNew = new ClassParser().getClass(strLine, lstComments, iLine, cModelParent);
        lstComments.splice(0, lstComments.length); //clearing the array

        // keep track of the new class, as long as it wasn't a single liner {}
        // but handle not having any curlies on the class line!
        if (openCurlies == 0 || openCurlies != closeCurlies) {
          cModels.push(cModelNew);
          cModel = cModelNew;
        }

        // add it to its parent (or track the parent)
        if (cModelParent != null && cModelNew) cModelParent.addChildClass(cModelNew);
        else cModelParent = cModelNew;
        continue;
      }

      // look for a method
      if (strLine.includes('(')) {
        // deal with a method over multiple lines.
        while (!strLine.includes(')')) {
          i = i + 1;
          strLine = contentLines[i];
          iLine++;
        }

        if (cModel) {
          let mModel = new MethodParser().getMethod(strLine, lstComments, iLine);
          cModel.getMethods().push(mModel);
        }

        lstComments.splice(0, lstComments.length); //clearing the array
        continue;
      }

      // handle set & get within the property
      if (
        strLine.includes(' get ') ||
        strLine.includes(' set ') ||
        strLine.includes(' get;') ||
        strLine.includes(' set;') ||
        strLine.includes(' get{') ||
        strLine.includes(' set{')
      )
        continue;

      // must be a property
      if (cModel) {
        let propertyModel = new PropertyParser().getProperty(strLine, lstComments, iLine);
        cModel.getProperties().push(propertyModel);
      }

      lstComments.splice(0, lstComments.length); //clearing the array
      continue;
    }

    return cModelParent ? cModelParent : null;
  }

  splitAndClean(rawFileContents: string) {
    let contentLines = rawFileContents.split('\n');
    return contentLines.map(line => line.replace('\r', ''));
  }

  countChars(str: string, ch: string) {
    return str.split(ch).length - 1;
  }

  strContainsScope(str: string) {
    str = str.toLowerCase();
    for (let i = 0; i < Scope.getInstance().get().length; i++) {
      if (
        str.toLowerCase().includes(
          Scope.getInstance()
            .get()
            [i].toLowerCase() + ' ',
        )
      ) {
        return Scope.getInstance().get()[i];
      }
    }
    return null;
  }
}
