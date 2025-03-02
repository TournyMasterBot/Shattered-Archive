import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Backstab from "@shared/types/ability-types/skills/Backstab";
import CutThroat from "@shared/types/ability-types/skills/CutThroat";
import Escape from "@shared/types/ability-types/skills/Escape";
import Flare from "@shared/types/ability-types/skills/Flare";
import Hide from "@shared/types/ability-types/skills/Hide";
import Lifebane from "@shared/types/ability-types/skills/Lifebane";
import Misdirection from "@shared/types/ability-types/skills/Misdirection";
import Nightmeld from "@shared/types/ability-types/skills/Nightmeld";
import Parry from "@shared/types/ability-types/skills/Parry";
import Rend from "@shared/types/ability-types/skills/Rend";
import SheathCut from "@shared/types/ability-types/skills/SheathCut";
import Sneak from "@shared/types/ability-types/skills/Sneak";
import Stalk from "@shared/types/ability-types/skills/Stalk";
import Sword from "@shared/types/ability-types/skills/Sword";
import WeaponSlip from "@shared/types/ability-types/skills/WeaponSlip";
import ServerCache from "@shared/cache/server-cache";

export class NightshadeDefault implements IAbilityGroup {
  static instance: NightshadeDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.NightshadeDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      Stalk.GetInstance(),
      Misdirection.GetInstance(),
      Nightmeld.GetInstance(),
      Lifebane.GetInstance(),
      Sneak.GetInstance(),
      WeaponSlip.GetInstance(),
      Escape.GetInstance(),
      SheathCut.GetInstance(),
      Sword.GetInstance(),
      Hide.GetInstance(),
      Rend.GetInstance(),
      CutThroat.GetInstance(),
      Flare.GetInstance(),
      Backstab.GetInstance(),
      Parry.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): NightshadeDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return NightshadeDefault.GetInstance() as T;
  }
}

export default NightshadeDefault;
