// Synthetic messages only. Regenerate with clang -framework Foundation and gzip the archive
// fields as in README.md. No Messages database, account, UI, or private data is accessed.
#import <Foundation/Foundation.h>
int main(void) {
  @autoreleasepool {
    NSArray *cases = @[
      @{@"name": @"short-command", @"text": @"YES", @"repeat": @1},
      @{@"name": @"reply", @"text": @"Sia › SIA-IMESSAGE-1007-OK", @"repeat": @1},
      @{@"name": @"printable-length", @"text": @"x", @"repeat": @95},
      @{@"name": @"one-byte-boundary", @"text": @"x", @"repeat": @127},
      @{@"name": @"two-byte-length", @"text": @"x", @"repeat": @128},
      @{@"name": @"two-byte-long", @"text": @"x", @"repeat": @4096},
      @{@"name": @"four-byte-length", @"text": @"x", @"repeat": @70000},
      @{@"name": @"unicode-multiline", @"text": @"  안녕 👩🏽‍💻\nYES\r\nsecond\tline\n ", @"repeat": @1},
      @{@"name": @"attachment", @"text": @"\uFFFC", @"repeat": @1},
      @{@"name": @"empty", @"text": @"", @"repeat": @1},
      @{@"name": @"mutable-multiple-runs", @"text": @"First\nsecond 👋\nthird", @"repeat": @1, @"mutable": @YES}
    ];
    NSMutableArray *output = [NSMutableArray array];
    for (NSDictionary *entry in cases) {
      NSMutableString *body = [NSMutableString string];
      for (NSUInteger i = 0; i < [entry[@"repeat"] unsignedIntegerValue]; i++)
        [body appendString:entry[@"text"]];
      NSDictionary *attributes = @{@"__kIMMessagePartAttributeName": @0};
      NSAttributedString *value;
      if ([entry[@"mutable"] boolValue]) {
        NSMutableAttributedString *mutable = [[NSMutableAttributedString alloc] initWithString:body attributes:attributes];
        [mutable addAttribute:@"synthetic-link-metadata-longer-than-the-short-body" value:@"fixture" range:NSMakeRange(0, 5)];
        value = mutable;
      } else value = [[NSAttributedString alloc] initWithString:body attributes:attributes];
      NSData *archive = [NSArchiver archivedDataWithRootObject:value];
      NSMutableDictionary *record = [entry mutableCopy];
      record[@"archiveBase64"] = [archive base64EncodedStringWithOptions:0];
      [output addObject:record];
    }
    NSData *json = [NSJSONSerialization dataWithJSONObject:output options:NSJSONWritingPrettyPrinted error:nil];
    fwrite(json.bytes, 1, json.length, stdout);
  }
  return 0;
}
