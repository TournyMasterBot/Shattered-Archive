import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class HasteCrater implements IAbility {
    private static instance: HasteCrater;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Haste Crater";
        this.helpFile = `
HASTE CRATER

Syntax:  cast 'haste crater' <target>

This spell, when cast successfully, allows the Eldritch to slow their 
victims' attacks, decreasing the number of attacks per round the target
can make. Though it differs slightly from the slow spellbook, it also 
allows the caster to take advantage of the slowed movement of their 
victim, making them easier to hit.   

Groups containing this spell: ELDRITCH`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (HasteCrater.instance === undefined) {
            HasteCrater.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): HasteCrater {
        if (!HasteCrater.instance) {
            HasteCrater.instance = new HasteCrater();
        }
        return HasteCrater.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return HasteCrater.GetInstance() as T;
    }
}

export default HasteCrater;