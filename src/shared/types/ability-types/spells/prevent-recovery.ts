import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class PreventRecovery implements IAbility {
    private static instance: PreventRecovery;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Prevent Recovery";
        this.helpFile = `prevent recovery
Syntax: c 'prevent recovery' <victim>

Prevent recovery allows a trained Necromancer to drain the life out of a
victim, leaving them unable to recover health, movement and or magic. 
Prevent recovery has been found effective to counteraffect other spells in
the realms...`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (PreventRecovery.instance === undefined) {
            PreventRecovery.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): PreventRecovery {
        if (!PreventRecovery.instance) {
            PreventRecovery.instance = new PreventRecovery();
        }
        return PreventRecovery.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return PreventRecovery.GetInstance() as T;
    }
}

export default PreventRecovery;