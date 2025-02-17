import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDamageTypeGroup from "@shared/types/damage-types/damage-type-group-interface";
import Beating from "@shared/types/damage-types/damage-type-models/beating";
import Blast from "@shared/types/damage-types/damage-type-models/blast"
import Crush from "@shared/types/damage-types/damage-type-models/crush"
import Pound from "@shared/types/damage-types/damage-type-models/pound"
import Punch from "@shared/types/damage-types/damage-type-models/punch"
import Slap from "@shared/types/damage-types/damage-type-models/slap"
import Slime from "@shared/types/damage-types/damage-type-models/slime"
import Smash from "@shared/types/damage-types/damage-type-models/smash"
import Suction from "@shared/types/damage-types/damage-type-models/suction"
import Thwack from "@shared/types/damage-types/damage-type-models/thwack"

export class BluntDamageTypes implements IDamageTypeGroup<BluntDamageTypes> {
    public static Beating = Beating.GetInstance().Get<Beating>();
    public static Blast = Blast.GetInstance().Get<Blast>();
    public static Crush = Crush.GetInstance().Get<Crush>();
    public static Pound = Pound.GetInstance().Get<Pound>();
    public static Punch = Punch.GetInstance().Get<Punch>();
    public static Slap = Slap.GetInstance().Get<Slap>();
    public static Slime = Slime.GetInstance().Get<Slime>();
    public static Smash = Smash.GetInstance().Get<Smash>();
    public static Suction = Suction.GetInstance().Get<Suction>();
    public static Thwack = Thwack.GetInstance().Get<Thwack>();

    public static getInstanceByName(name: string): IDamageType | undefined {
        for (const key in BluntDamageTypes) {
            if (BluntDamageTypes.hasOwnProperty(key)) {
                const instance = (BluntDamageTypes as any)[key];
                if (instance.name === name) {
                    return instance;
                }
            }
        }
        return undefined;
    }

    public static getAll(): IDamageType[] {
        const types: IDamageType[] = []
        for (const key in BluntDamageTypes) {
            if (BluntDamageTypes.hasOwnProperty(key)) {
                const instance = (BluntDamageTypes as any)[key];
                types.push(instance);
            }
        }
        return types;
    }
}
export default BluntDamageTypes;