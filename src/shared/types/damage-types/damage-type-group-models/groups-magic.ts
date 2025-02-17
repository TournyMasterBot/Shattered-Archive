import IDamageType from "@shared/types/damage-types/damage-type-interface";;
import AcidicBite from "@shared/types/damage-types/damage-type-models/acidic-bite";
import Chill from "@shared/types/damage-types/damage-type-models/chill";
import Divine from "@shared/types/damage-types/damage-type-models/divine";
import Drain from "@shared/types/damage-types/damage-type-models/drain";
import Flame from "@shared/types/damage-types/damage-type-models/flame";
import FlamingBite from "@shared/types/damage-types/damage-type-models/flaming-bite";
import FreezingBite from "@shared/types/damage-types/damage-type-models/freezing-bite";
import Magic from "@shared/types/damage-types/damage-type-models/magic";
import Shock from "@shared/types/damage-types/damage-type-models/shock";
import ShockingBite from "@shared/types/damage-types/damage-type-models/shocking-bite";
import Wrath from "@shared/types/damage-types/damage-type-models/wrath";

export class MagicDamageTypes {
    public static AcidicBite = AcidicBite.GetInstance().Get<AcidicBite>();
    public static Divine = Divine.GetInstance().Get<Divine>();
    public static Drain = Drain.GetInstance().Get<Drain>();
    public static Flame = Flame.GetInstance().Get<Flame>();
    public static FlamingBite = FlamingBite.GetInstance().Get<FlamingBite>();
    public static Chill = Chill.GetInstance().Get<Chill>();
    public static FreezingBite = FreezingBite.GetInstance().Get<FreezingBite>();
    public static Magic = Magic.GetInstance().Get<Magic>();
    public static Shock = Shock.GetInstance().Get<Shock>();
    public static ShockingBite = ShockingBite.GetInstance().Get<ShockingBite>();
    public static Wrath = Wrath.GetInstance().Get<Wrath>();
    
    public static getInstanceByName(name: string): IDamageType | undefined {
        for (const key in MagicDamageTypes) {
            if (MagicDamageTypes.hasOwnProperty(key)) {
                const instance = (MagicDamageTypes as any)[key];
                if (instance.name === name) {
                    return instance;
                }
            }
        }
        return undefined;
    }

    public static getAll(): IDamageType[] {
        const types: IDamageType[] = []
        for (const key in MagicDamageTypes) {
            if (MagicDamageTypes.hasOwnProperty(key)) {
                const instance = (MagicDamageTypes as any)[key];
                types.push(instance);
            }
        }
        return types;
    }
}
export default MagicDamageTypes;