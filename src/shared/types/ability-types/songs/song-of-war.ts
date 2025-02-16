import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class SongOfWar implements IAbility {
    private static instance: SongOfWar;

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
        this.name = "Song of War";
        this.abilityGroupType = AbilityGroupType.Songs;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
Song of War - With this song, the singer's melodious voice will inspire 
those who are close to the singer so they can find their own strength and  
in doing so, will find themselves able to strike harder and more accurately 
than before.
`;

        if (SongOfWar.instance === undefined) {
            SongOfWar.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): SongOfWar {
        if (!SongOfWar.instance) {
            SongOfWar.instance = new SongOfWar();
        }
        return SongOfWar.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return SongOfWar.GetInstance() as T;
    }
}

export default SongOfWar;