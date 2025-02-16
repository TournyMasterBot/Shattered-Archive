import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import ChantOfAccuracy from "../songs/chant-of-accuracy";
import CallToArms from "../songs/call-to-arms";
import WarHowl from "../songs/war-howl";
import DirgeOfDetection from "../songs/dirge-of-detection";
import MelodyOfMeditation from "../songs/melody-of-meditation";
import YelpOfAggression from "../songs/yelp-of-aggression";
import RequiemOfWayfaring from "../songs/requiem-of-wayfaring";
import JubileeOfRegeneration from "../songs/jubilee-of-regeneration";
import WarbleOfArrest from "../songs/warble-of-arrest";
import RousalOfResistance from "../songs/rousal-of-ressistance";

export class SkaldChants implements IAbilityGroup {
    static instance: SkaldChants;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.SkaldChants;
        this.abilityGroupType = AbilityGroupType.Songs;
        this.abilities = [
            ChantOfAccuracy.GetInstance().Get(),
            CallToArms.GetInstance().Get(),
            WarHowl.GetInstance().Get(),
            RousalOfResistance.GetInstance().Get(),
            DirgeOfDetection.GetInstance().Get(),
            MelodyOfMeditation.GetInstance().Get(),
            YelpOfAggression.GetInstance().Get(),
            RequiemOfWayfaring.GetInstance().Get(),
            JubileeOfRegeneration.GetInstance().Get(),
            WarbleOfArrest.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): SkaldChants {
        if (!SkaldChants.instance) {
            SkaldChants.instance = new SkaldChants();
        }
        return SkaldChants.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return SkaldChants.GetInstance() as T;
    }
}

export default SkaldChants;
