import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class HeatMetal implements IAbility {
    private static instance: HeatMetal;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Heat Metal";
        this.helpFile = `
help 'Heat Metal'
'HEAT METAL'
HEAT METAL

Syntax: cast 'heat metal' <target>

Heat metal is a powerful clerical attack spell, with effects that vary
according to the armor of the victim. It heats up the metal equipment
(assumed to be all weapons and armor at this point in time) on the target,
causing him or her to drop them if possible, taking serious burns in the
process (possibly fatal if the equipment is too heavy to remove easily).

This spell does no damage to creatures who are immune to fire. Using this
spell when you are EQless is illegal.

See also - ATTACK
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (HeatMetal.instance === undefined) {
            HeatMetal.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): HeatMetal {
        if (!HeatMetal.instance) {
            HeatMetal.instance = new HeatMetal();
        }
        return HeatMetal.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return HeatMetal.GetInstance() as T;
    }
}

export default HeatMetal;