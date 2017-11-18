package log

import (
	"fmt"
	"time"

	"go.uber.org/zap/buffer"
	"go.uber.org/zap/zapcore"
)

type CustomEncoder struct {
	*zapcore.MapObjectEncoder
	startingTime time.Time
}

func (enc CustomEncoder) Clone() zapcore.Encoder {
	panic("Clone called")
}

func (enc CustomEncoder) EncodeEntry(entry zapcore.Entry, fields []zapcore.Field) (*buffer.Buffer, error) {
	newEncoder := CustomEncoder{
		MapObjectEncoder: zapcore.NewMapObjectEncoder(),
	}
	buf := pool.Get()

	secondsSinceStart := entry.Time.Sub(enc.startingTime).Seconds()
	buf.AppendString(fmt.Sprintf("%5.1f ", secondsSinceStart))

	buf.AppendString(entry.Message)

	for _, field := range fields {
		field.AddTo(newEncoder)
	}
	for _, field := range fields {
		value := newEncoder.MapObjectEncoder.Fields[field.Key]
		if value == "" {
			buf.AppendString(" ''")
		} else {
			buf.AppendString(fmt.Sprintf(" %v", value))
		}
	}

	buf.AppendByte('\n')

	return buf, nil
}

func constructEncoder(config zapcore.EncoderConfig) (zapcore.Encoder, error) {
	return CustomEncoder{
		MapObjectEncoder: zapcore.NewMapObjectEncoder(),
		startingTime:     time.Now(),
	}, nil
}