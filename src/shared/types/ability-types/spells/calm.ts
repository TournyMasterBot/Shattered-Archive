import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Calm implements IAbility {
    private static instance: Calm;

    name: string;
    helpFile: string;
    manualDescription?: string | undefined;
    duration?: number | undefined;
    effects?: SkillSpellEffects | undefined;
    group?: string | undefined;
    alternateKeyword?: string | undefined;
    recommendedHelpFileChanges?: string | undefined;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Calm";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
help Calm
CALM

Syntax: cast 'calm'

One of the most useful and often overlooked abilities of the master cleric
is the calm spell, which can put an end to all violence in a room.  Calmed
creatures will not attack of their own volition, and are at a disadvantage
in combat as long as the spell soothes their minds.  

The more violent activity there is in a room, the harder the spell, and it
is all or nothing -- either all combat in the room is ended (with the
exception of those who are immune to magic) or none is.  

See also - BEGUILING 
`;

        if (Calm.instance === undefined) {
            Calm.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Calm {
        if (!Calm.instance) {
            Calm.instance = new Calm();
        }
        return Calm.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Calm.GetInstance() as T;
    }
}

export default Calm;