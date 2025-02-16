import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Slash extends DamageType implements IDamageType {
    private static instance: Slash; 
    
    constructor() {
        super({
            id: "slash",
            name: "Slash",
            type: DslDamageType.Slash,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Slash {
        if (!Slash.instance) {
            Slash.instance = new Slash();
        }
        return Slash.instance;
    }

    public Get<T>(): T {
        return Slash.GetInstance() as T;
    }
}

export default Slash;