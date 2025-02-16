import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RemoveCurse implements IAbility {
    private static instance: RemoveCurse;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Remove Curse";
        this.helpFile = `
help 'Remove Curse'
'REMOVE CURSE'
'REMOVE CURSE'

Syntax: cast 'remove curse' <character>
        cast 'remove curse' <object>

This spell removes a curse from a character, and might possibly uncurse a
cursed object.  It may also be targeted on an object in the caster's
inventory, in which case it's chance of success is significantly higher.  

See also - BENEDICTIONS
        `;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (RemoveCurse.instance === undefined) {
            RemoveCurse.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): RemoveCurse {
        if (!RemoveCurse.instance) {
            RemoveCurse.instance = new RemoveCurse();
        }
        return RemoveCurse.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return RemoveCurse.GetInstance() as T;
    }
}

export default RemoveCurse;