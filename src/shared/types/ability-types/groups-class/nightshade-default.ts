import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Backstab from "@shared/types/ability-types/skills/backstab";
import CutThroat from "@shared/types/ability-types/skills/cut-throat";
import Escape from "@shared/types/ability-types/skills/escape";
import Flare from "@shared/types/ability-types/skills/flare";
import Hide from "@shared/types/ability-types/skills/hide";
import Lifebane from "@shared/types/ability-types/skills/lifebane";
import Misdirection from "@shared/types/ability-types/skills/misdirection";
import Nightmeld from "@shared/types/ability-types/skills/nightmeld";
import Parry from "@shared/types/ability-types/skills/parry";
import Rend from "@shared/types/ability-types/skills/rend";
import SheathCut from "@shared/types/ability-types/skills/sheath-cut";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Stalk from "@shared/types/ability-types/skills/stalk";
import Sword from "@shared/types/ability-types/skills/sword";
import WeaponSlip from "@shared/types/ability-types/skills/weapon-slip";

export class NightshadeDefault implements IAbilityGroup {
  static instance: NightshadeDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.NightshadeDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      Stalk.GetInstance().Get(),
      Misdirection.GetInstance().Get(),
      Nightmeld.GetInstance().Get(),
      Lifebane.GetInstance().Get(),
      Sneak.GetInstance().Get(),
      WeaponSlip.GetInstance().Get(),
      Escape.GetInstance().Get(),
      SheathCut.GetInstance().Get(),
      Sword.GetInstance().Get(),
      Hide.GetInstance().Get(),
      Rend.GetInstance().Get(),
      CutThroat.GetInstance().Get(),
      Flare.GetInstance().Get(),
      Backstab.GetInstance().Get(),
      Parry.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): NightshadeDefault {
    if (!NightshadeDefault.instance) {
      NightshadeDefault.instance = new NightshadeDefault();
    }
    return NightshadeDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return NightshadeDefault.GetInstance() as T;
  }
}

export default NightshadeDefault;
