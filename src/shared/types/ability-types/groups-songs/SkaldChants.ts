import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import ChantOfAccuracy from "@shared/types/ability-types/songs/chant-of-accuracy";
import CallToArms from "@shared/types/ability-types/songs/call-to-arms";
import WarHowl from "@shared/types/ability-types/songs/war-howl";
import DirgeOfDetection from "@shared/types/ability-types/songs/dirge-of-detection";
import MelodyOfMeditation from "@shared/types/ability-types/songs/melody-of-meditation";
import YelpOfAggression from "@shared/types/ability-types/songs/yelp-of-aggression";
import RequiemOfWayfaring from "@shared/types/ability-types/songs/requiem-of-wayfaring";
import JubileeOfRegeneration from "@shared/types/ability-types/songs/jubilee-of-regeneration";
import WarbleOfArrest from "@shared/types/ability-types/songs/warble-of-arrest";
import RousalOfResistance from "@shared/types/ability-types/songs/rousal-of-ressistance";
import ServerCache from "@shared/cache/server-cache";

export class SkaldChants implements IAbilityGroup {
  static instance: SkaldChants;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.SkaldChants;
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilities = [
      ChantOfAccuracy.GetInstance(),
      CallToArms.GetInstance(),
      WarHowl.GetInstance(),
      RousalOfResistance.GetInstance(),
      DirgeOfDetection.GetInstance(),
      MelodyOfMeditation.GetInstance(),
      YelpOfAggression.GetInstance(),
      RequiemOfWayfaring.GetInstance(),
      JubileeOfRegeneration.GetInstance(),
      WarbleOfArrest.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): SkaldChants {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SkaldChants.GetInstance() as T;
  }
}

export default SkaldChants;
